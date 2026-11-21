package lexorank

import (
	"testing"
)

func TestLexoRankBetween(t *testing.T) {
	t.Run("initial rank when both empty", func(t *testing.T) {
		rank := Between("", "")
		if rank != InitialRank {
			t.Errorf("expected %s, got %s", InitialRank, rank)
		}
	})

	t.Run("between two ranks stays compact in fixed width", func(t *testing.T) {
		r1 := Between("", "")
		r2 := Between(r1, "")
		rMid := Between(r1, r2)

		if r1 >= rMid || rMid >= r2 {
			t.Errorf("expected %s < %s < %s", r1, rMid, r2)
		}
		if len(rMid) != len(InitialRank) {
			t.Errorf("expected fixed-width rank, got %q (len=%d)", rMid, len(rMid))
		}
	})

	t.Run("insert at head repeatedly stays compact and strictly ordered", func(t *testing.T) {
		cur := InitialRank
		for i := range 1000 {
			nextHead, ok := TryBetween("", cur)
			if !ok {
				t.Fatalf("iteration %d: TryBetween(\"\", %q) failed", i, cur)
			}
			if nextHead >= cur {
				t.Fatalf("iteration %d: expected %q < %q", i, nextHead, cur)
			}
			if len(nextHead) != len(InitialRank) {
				t.Fatalf(
					"iteration %d: expected fixed-width rank, got %q",
					i,
					nextHead,
				)
			}
			if nextHead[len(nextHead)-1] == '0' {
				t.Fatalf("iteration %d: rank %q ends with '0'", i, nextHead)
			}
			cur = nextHead
		}
	})

	t.Run("insert at tail repeatedly stays compact and strictly ordered", func(t *testing.T) {
		cur := InitialRank
		for i := range 1000 {
			nextTail, ok := TryBetween(cur, "")
			if !ok {
				t.Fatalf("iteration %d: TryBetween(%q, \"\") failed", i, cur)
			}
			if nextTail <= cur {
				t.Fatalf("iteration %d: expected %q > %q", i, nextTail, cur)
			}
			if len(nextTail) != len(InitialRank) {
				t.Fatalf(
					"iteration %d: expected fixed-width rank, got %q",
					i,
					nextTail,
				)
			}
			if nextTail[len(nextTail)-1] == '0' {
				t.Fatalf("iteration %d: rank %q ends with '0'", i, nextTail)
			}
			cur = nextTail
		}
	})

	t.Run("insert near lower and upper bounds extends cleanly", func(t *testing.T) {
		curHead := "0|000001"
		for i := range 20 {
			nextHead, ok := TryBetween("", curHead)
			if !ok || nextHead >= curHead {
				t.Fatalf(
					"head boundary iter %d: expected < %q, got %q (ok=%v)",
					i,
					curHead,
					nextHead,
					ok,
				)
			}
			curHead = nextHead
		}

		curTail := "0|zzzzzz"
		for i := range 20 {
			nextTail, ok := TryBetween(curTail, "")
			if !ok || nextTail <= curTail {
				t.Fatalf(
					"tail boundary iter %d: expected > %q, got %q (ok=%v)",
					i,
					curTail,
					nextTail,
					ok,
				)
			}
			curTail = nextTail
		}
	})

	t.Run("insert at head before legacy 0|a and between 0|a and 0|aa", func(t *testing.T) {
		rHead, ok := TryBetween("", "0|a")
		if !ok || rHead >= "0|a" {
			t.Fatalf("expected valid rank < 0|a, got %q (ok=%v)", rHead, ok)
		}

		rMid, ok := TryBetween("0|a", "0|aa")
		if !ok || rMid <= "0|a" || rMid >= "0|aa" {
			t.Fatalf("expected 0|a < %q < 0|aa (ok=%v)", rMid, ok)
		}
	})

	t.Run("insert between repeatedly at same boundary", func(t *testing.T) {
		prev := InitialRank
		next := Between(prev, "")
		for i := range 100 {
			mid, ok := TryBetween(prev, next)
			if !ok {
				t.Fatalf("iteration %d: TryBetween(%q, %q) failed", i, prev, next)
			}
			if mid <= prev || mid >= next {
				t.Fatalf("iteration %d: expected %q < %q < %q", i, prev, mid, next)
			}
			if mid[len(mid)-1] == '0' {
				t.Fatalf("iteration %d: rank %q ends with '0'", i, mid)
			}
			if i%2 == 0 {
				next = mid
			} else {
				prev = mid
			}
		}
	})

	t.Run("handles adjacent ranks separated by a single trailing-zero value", func(t *testing.T) {
		mid, ok := TryBetween("0|a0000z", "0|a00011")
		if !ok || mid <= "0|a0000z" || mid >= "0|a00011" {
			t.Fatalf("expected 0|a0000z < %q < 0|a00011 (ok=%v)", mid, ok)
		}
		if mid[len(mid)-1] == '0' {
			t.Fatalf("expected non-zero trailing char, got %q", mid)
		}
	})

	t.Run("returns ok=false when no valid rank exists", func(t *testing.T) {
		cases := []struct {
			name string
			prev string
			next string
		}{
			{name: "before min char 0|0", prev: "", next: "0|0"},
			{name: "before min chars 0|000000", prev: "", next: "0|000000"},
			{name: "equal ranks", prev: "0|i0000i", next: "0|i0000i"},
			{name: "inverted ranks", prev: "0|i0010i", next: "0|i0000i"},
			{name: "prefix with trailing min char", prev: "0|a", next: "0|a0"},
			{name: "invalid prefix", prev: "bad", next: InitialRank},
		}
		for _, tc := range cases {
			t.Run(tc.name, func(t *testing.T) {
				if rank, ok := TryBetween(tc.prev, tc.next); ok {
					t.Errorf("expected ok=false for (%q, %q), got %q", tc.prev, tc.next, rank)
				}
			})
		}
	})
}

func TestGenerateRanks(t *testing.T) {
	for _, n := range []int{0, 1, 2, 5, 25, 200} {
		ranks := GenerateRanks(n)
		if len(ranks) != n {
			t.Fatalf("GenerateRanks(%d): expected %d ranks, got %d", n, n, len(ranks))
		}
		for i := range n {
			if len(ranks[i]) != len(InitialRank) {
				t.Errorf("GenerateRanks(%d)[%d] = %q expected fixed width", n, i, ranks[i])
			}
			if ranks[i][len(ranks[i])-1] == '0' {
				t.Errorf("GenerateRanks(%d)[%d] = %q ends with '0'", n, i, ranks[i])
			}
			if i > 0 && ranks[i-1] >= ranks[i] {
				t.Errorf(
					"GenerateRanks(%d): non-ascending at %d: %q >= %q",
					n,
					i,
					ranks[i-1],
					ranks[i],
				)
			}
		}
		if n > 0 {
			if head, ok := TryBetween("", ranks[0]); !ok || head >= ranks[0] {
				t.Errorf("GenerateRanks(%d): cannot insert before first rank %q", n, ranks[0])
			}
			if tail, ok := TryBetween(ranks[n-1], ""); !ok || tail <= ranks[n-1] {
				t.Errorf("GenerateRanks(%d): cannot insert after last rank %q", n, ranks[n-1])
			}
		}
	}
}
