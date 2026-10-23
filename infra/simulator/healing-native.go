package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"

	"github.com/wowsims/classic/sim"
	"github.com/wowsims/classic/sim/priest/healing"
)

func main() {
	sim.RegisterAll()
	healing.RegisterHealingPriest()
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 65536), 4*1024*1024+1)
	encoder := json.NewEncoder(os.Stdout)
	for scanner.Scan() {
		if err := encoder.Encode(healing.RunKFCHealingJob(context.Background(), scanner.Bytes())); err != nil {
			fmt.Fprintln(os.Stderr, "Could not encode healing worker reply:", err)
			os.Exit(1)
		}
	}
	if err := scanner.Err(); err != nil {
		fmt.Fprintln(os.Stderr, "Could not read healing worker input:", err)
		os.Exit(1)
	}
}
