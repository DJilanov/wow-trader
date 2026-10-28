package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strconv"

	"github.com/wowsims/classic/sim/core/proto"
	"google.golang.org/protobuf/encoding/protojson"
	googleProto "google.golang.org/protobuf/proto"
)

func main() {
	if len(os.Args) != 5 {
		panic("Expected parent database, eight reviewed additions, parent count and output database")
	}
	parentCount, err := strconv.Atoi(os.Args[3])
	if err != nil || parentCount < 1 {
		panic("Invalid declared parent count")
	}
	parent, err := os.ReadFile(os.Args[1])
	if err != nil {
		panic(err)
	}
	database := &proto.UIDatabase{}
	if err := googleProto.Unmarshal(parent, database); err != nil {
		panic(err)
	}
	original := googleProto.Clone(database).(*proto.UIDatabase)
	if len(original.Items) != parentCount {
		panic("Unexpected parent catalog")
	}
	bytes, err := os.ReadFile(os.Args[2])
	if err != nil {
		panic(err)
	}
	var additions []json.RawMessage
	if err := json.Unmarshal(bytes, &additions); err != nil {
		panic(err)
	}
	if len(additions) != 8 {
		panic("Expected exactly eight Deathmist items")
	}
	seen := map[int32]bool{}
	for _, item := range database.Items {
		if seen[item.Id] {
			panic("Duplicate parent item")
		}
		seen[item.Id] = true
	}
	for index, body := range additions {
		item := &proto.UIItem{}
		if err := protojson.Unmarshal(body, item); err != nil {
			panic(err)
		}
		if item.Id != int32(22070+index) || item.SetId != 518 || seen[item.Id] || len(item.ClassAllowlist) != 1 || item.ClassAllowlist[0] != proto.Class_ClassWarlock {
			panic("Invalid Deathmist catalog addition")
		}
		seen[item.Id] = true
		database.Items = append(database.Items, item)
	}
	for index, item := range original.Items {
		if !googleProto.Equal(item, database.Items[index]) {
			panic("Parent item changed")
		}
	}
	left, right := googleProto.Clone(original).(*proto.UIDatabase), googleProto.Clone(database).(*proto.UIDatabase)
	left.Items, right.Items = nil, nil
	if !googleProto.Equal(left, right) {
		panic("Non-item database data changed")
	}
	encoded, err := (googleProto.MarshalOptions{Deterministic: true}).Marshal(database)
	if err != nil {
		panic(err)
	}
	decoded := &proto.UIDatabase{}
	if err := googleProto.Unmarshal(encoded, decoded); err != nil {
		panic(err)
	}
	if !googleProto.Equal(database, decoded) {
		panic("Database round-trip changed data")
	}
	if err := os.WriteFile(os.Args[4], encoded, 0644); err != nil {
		panic(err)
	}
	fmt.Printf("{\"parentItemsPreserved\":%d,\"addedItems\":8,\"decodedItems\":%d,\"nonItemFieldsPreserved\":true,\"roundTripEqual\":true}\n", parentCount, len(decoded.Items))
}
