package main

import (
	"encoding/json"
	"os"
	"sort"

	"github.com/wowsims/classic/assets/database"
)

type itemIdentity struct {
	ID    int32 `json:"id"`
	SetID int32 `json:"setId"`
}

func main() {
	db := database.Load()
	items := make([]itemIdentity, 0, len(db.Items))
	for _, item := range db.Items {
		items = append(items, itemIdentity{ID: item.Id, SetID: item.SetId})
	}
	sort.Slice(items, func(left, right int) bool { return items[left].ID < items[right].ID })
	if err := json.NewEncoder(os.Stdout).Encode(items); err != nil {
		panic(err)
	}
}
