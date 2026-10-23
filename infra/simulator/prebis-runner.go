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
	"github.com/wowsims/classic/sim/core/stats"
	"google.golang.org/protobuf/encoding/protojson"
	googleproto "google.golang.org/protobuf/proto"
)

type job struct {
	ID            string `json:"id"`
	RequestBase64 string `json:"requestBase64"`
	Gear          []struct {
		ID      int32 `json:"id"`
		Enchant int32 `json:"enchant"`
	} `json:"gear"`
	Iterations    int32           `json:"iterations"`
	Seed          int64           `json:"seed"`
	TalentsString string          `json:"talentsString"`
	Rotation      json.RawMessage `json:"rotation"`
	Duration      float64         `json:"duration"`
	Detail        bool            `json:"detail"`
}

type result struct {
	ID         string          `json:"id"`
	DPS        float64         `json:"dps"`
	Stdev      float64         `json:"stdev"`
	Iterations int32           `json:"iterations"`
	Error      string          `json:"error,omitempty"`
	Metrics    json.RawMessage `json:"metrics,omitempty"`
	Health     float64         `json:"health,omitempty"`
	Armor      float64         `json:"armor,omitempty"`
}

func run(input job) (out result) {
	out.ID = input.ID
	defer func() {
		if failure := recover(); failure != nil {
			out.Error = fmt.Sprint(failure)
		}
	}()
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
	if request.GetRaid() == nil || request.GetEncounter() == nil || request.GetSimOptions() == nil || input.Iterations < 1 || input.Iterations > 100000 || len(input.Gear) != 17 {
		out.Error = "Invalid single-player optimization request"
		return
	}
	var parties []*proto.Party
	count := 0
	for _, party := range request.Raid.Parties {
		var players []*proto.Player
		for _, player := range party.Players {
			if player.Class != proto.Class_ClassUnknown {
				players = append(players, player)
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
	player := request.Raid.Parties[0].Players[0]
	player.Database = nil
	player.ForeverTier1Bonuses = false
	player.EnableItemSwap = false
	if input.TalentsString != "" {
		player.TalentsString = input.TalentsString
	}
	if len(input.Rotation) > 0 {
		rotation := &proto.APLRotation{}
		if err := protojson.Unmarshal(input.Rotation, rotation); err != nil {
			out.Error = err.Error()
			return
		}
		player.Rotation = rotation
	}
	player.Equipment = &proto.EquipmentSpec{}
	for _, item := range input.Gear {
		if item.ID != 0 {
			if _, ok := core.ItemsByID[item.ID]; !ok {
				out.Error = fmt.Sprintf("Unknown item %d", item.ID)
				return
			}
		}
		player.Equipment.Items = append(player.Equipment.Items, &proto.ItemSpec{Id: item.ID, Enchant: item.Enchant})
	}
	request.Encounter.Duration = 300
	if input.Duration != 0 {
		if input.Duration < 30 || input.Duration > 600 {
			out.Error = "Invalid encounter duration"
			return
		}
		request.Encounter.Duration = input.Duration
	}
	request.Encounter.DurationVariation = 0
	request.Encounter.UseHealth = false
	request.SimOptions.Iterations = input.Iterations
	request.SimOptions.RandomSeed = input.Seed
	request.SimOptions.Ruleset = proto.Ruleset_RulesetForever
	request.SimOptions.Debug = false
	request.SimOptions.DebugFirstIteration = false
	request.SimOptions.SaveAllValues = false
	if input.Detail {
		copy := googleproto.Clone(request).(*proto.RaidSimRequest)
		computed := core.ComputeStats(&proto.ComputeStatsRequest{
			Raid: copy.Raid, Encounter: copy.Encounter, Ruleset: copy.SimOptions.Ruleset,
		})
		if computed.ErrorResult != "" {
			out.Error = computed.ErrorResult
			return
		}
		final := computed.RaidStats.Parties[0].Players[0].FinalStats.Stats
		out.Health, out.Armor = final[stats.Health], final[stats.Armor]
	}
	metrics := core.RunRaidSim(request)
	if metrics.Error != nil {
		out.Error = metrics.Error.Message
		return
	}
	dps := metrics.RaidMetrics.Parties[0].Players[0].Dps
	out.DPS, out.Stdev, out.Iterations = dps.Avg, dps.Stdev, input.Iterations
	if input.Detail {
		out.Metrics, err = protojson.Marshal(metrics.RaidMetrics.Parties[0].Players[0])
		if err != nil {
			out.Error = err.Error()
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
		var input job
		if err := json.Unmarshal(scanner.Bytes(), &input); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		if err := encoder.Encode(run(input)); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	}
	if err := scanner.Err(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
