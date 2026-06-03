package main

import "fmt"

var beta3 = map[int]float64{
	0: 1.0,
	1: -23.29,
	2: -7.93,
	3: -0.81,
	4: 0.0,
}

type Scenario struct {
	Name     string
	KOOS     float64
	DeltaROM float64
	KL       int
}

func rawScore(koos, deltaROM float64, kl int) float64 {
	return 139.95 - 0.93*koos - 0.785*deltaROM + beta3[kl]
}

func finalScore(raw, rawMin, rawMax float64) float64 {
	score := 100 * (rawMax - raw) / (rawMax - rawMin)

	if score < 0 {
		return 0
	}
	if score > 100 {
		return 100
	}
	return score
}

func level(score float64) int {
	if score <= 20 {
		return 1
	}
	if score <= 40 {
		return 2
	}
	if score <= 60 {
		return 3
	}
	if score <= 80 {
		return 4
	}
	return 5
}

func main() {
	rawMin := 20.60
	rawMax := 140.55

	scenarios := []Scenario{
		{"Very poor", 0, 0, 0},
		{"Poor", 20, 20, 3},
		{"Medium", 45, 35, 4},
		{"Good", 65, 45, 2},
		{"Excellent", 90, 60, 4},
	}

	fmt.Printf("%-15s %-8s %-10s %-4s %-10s %-10s %-5s\n",
		"Scenario", "KOOS", "DeltaROM", "KL", "Raw", "Final", "Level")

	for _, s := range scenarios {
		raw := rawScore(s.KOOS, s.DeltaROM, s.KL)
		final := finalScore(raw, rawMin, rawMax)
		lvl := level(final)

		fmt.Printf("%-15s %-8.2f %-10.2f %-4d %-10.2f %-10.2f %-5d\n",
			s.Name, s.KOOS, s.DeltaROM, s.KL, raw, final, lvl)
	}
}
