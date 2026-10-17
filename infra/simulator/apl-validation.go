package main

import (
	"bufio"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"

	"github.com/wowsims/classic/sim"
	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"google.golang.org/protobuf/encoding/protojson"
	googleproto "google.golang.org/protobuf/proto"
)

type validationJob struct {
	ID            string          `json:"id"`
	RequestBase64 string          `json:"requestBase64"`
	TalentsString string          `json:"talentsString"`
	Rotation      json.RawMessage `json:"rotation"`
}

type rotationWarning struct {
	Section string `json:"section"`
	Index   int    `json:"index"`
	Message string `json:"message"`
}

type validationResult struct {
	ID       string            `json:"id"`
	Warnings []rotationWarning `json:"warnings"`
	Error    string            `json:"error,omitempty"`
}

func validateRotation(input validationJob) (out validationResult) {
	out.ID = input.ID
	out.Warnings = []rotationWarning{}
	defer func() {
		if failure := recover(); failure != nil {
			out.Error = fmt.Sprint(failure)
		}
	}()
	if input.ID == "" || input.TalentsString == "" || len(input.Rotation) == 0 {
		out.Error = "Missing APL validation identity, talents or rotation"
		return
	}
	bytes, err := base64.StdEncoding.DecodeString(input.RequestBase64)
	if err != nil {
		out.Error = err.Error()
		return
	}
	request := &proto.RaidSimRequest{}
	if err = googleproto.Unmarshal(bytes, request); err != nil {
		out.Error = err.Error()
		return
	}
	if request.Raid == nil || request.Encounter == nil {
		out.Error = "Missing controlled raid or encounter"
		return
	}
	var parties []*proto.Party
	var player *proto.Player
	count := 0
	for _, party := range request.Raid.Parties {
		var players []*proto.Player
		for _, candidate := range party.Players {
			if candidate.Class != proto.Class_ClassUnknown {
				players = append(players, candidate)
				player = candidate
				count++
			}
		}
		if len(players) > 0 {
			party.Players = players
			parties = append(parties, party)
		}
	}
	if count != 1 {
		out.Error = fmt.Sprintf("Expected one player, got %d", count)
		return
	}
	request.Raid.Parties = parties
	request.Raid.NumActiveParties = 1
	player.Database = nil
	player.ForeverTier1Bonuses = false
	player.EnableItemSwap = false
	player.TalentsString = input.TalentsString
	player.Rotation = &proto.APLRotation{}
	if err = protojson.Unmarshal(input.Rotation, player.Rotation); err != nil {
		out.Error = err.Error()
		return
	}
	stats := core.ComputeStats(&proto.ComputeStatsRequest{
		Raid: request.Raid, Encounter: request.Encounter, Ruleset: proto.Ruleset_RulesetForever,
	})
	if stats.ErrorResult != "" {
		out.Error = stats.ErrorResult
		return
	}
	rotation := stats.RaidStats.Parties[0].Players[0].RotationStats
	if rotation == nil {
		out.Error = "Engine returned no APL validation stats"
		return
	}
	if len(rotation.PriorityList) != len(player.Rotation.PriorityList) || len(rotation.PrepullActions) != len(player.Rotation.PrepullActions) {
		out.Error = "Engine APL validation coverage changed"
		return
	}
	for _, section := range []struct {
		name    string
		actions []*proto.APLActionStats
	}{{"prepull", rotation.PrepullActions}, {"priority", rotation.PriorityList}} {
		for index, action := range section.actions {
			for _, warning := range action.Warnings {
				out.Warnings = append(out.Warnings, rotationWarning{section.name, index, warning})
			}
		}
	}
	return
}

func main() {
	sim.RegisterAll()
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 65536), 4*1024*1024)
	encoder := json.NewEncoder(os.Stdout)
	for scanner.Scan() {
		var input validationJob
		if err := json.Unmarshal(scanner.Bytes(), &input); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		if err := encoder.Encode(validateRotation(input)); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	}
	if err := scanner.Err(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
