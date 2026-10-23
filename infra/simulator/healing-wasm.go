//go:build js && wasm

package main

import (
	"context"
	"encoding/json"
	"syscall/js"

	"github.com/wowsims/classic/sim"
	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/priest/healing"
)

func main() {
	core.SetRunningInWasm()
	sim.RegisterAll()
	healing.RegisterHealingPriest()
	run := js.FuncOf(func(_ js.Value, args []js.Value) interface{} {
		var payload []byte
		if len(args) == 1 && args[0].Type() == js.TypeString {
			payload = []byte(args[0].String())
		}
		reply := healing.RunKFCHealingJob(context.Background(), payload)
		encoded, err := json.Marshal(reply)
		if err != nil {
			return js.ValueOf(map[string]interface{}{"transportError": "Could not encode healing worker reply"})
		}
		return string(encoded)
	})
	js.Global().Set("kfcHealingSimulate", run)
	if ready := js.Global().Get("kfcHealingWasmReady"); ready.Type() == js.TypeFunction {
		ready.Invoke()
	}
	select {}
}
