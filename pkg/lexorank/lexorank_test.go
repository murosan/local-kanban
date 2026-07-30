package lexorank

import (
	"testing"
)

func TestLexoRankBetween(t *testing.T) {
	t.Run("initial rank when both empty", func(t *testing.T) {
		rank := Between("", "")
		if rank != "0|m" {
			t.Errorf("expected 0|m, got %s", rank)
		}
	})

	t.Run("between two ranks", func(t *testing.T) {
		r1 := Between("", "")   // 0|m
		r2 := Between(r1, "")   // 0|t
		rMid := Between(r1, r2) // Should be between 0|m and 0|t

		if r1 >= rMid || rMid >= r2 {
			t.Errorf("expected %s < %s < %s", r1, rMid, r2)
		}
	})

	t.Run("insert at head", func(t *testing.T) {
		r1 := "0|m"
		rHead := Between("", r1)
		if rHead >= r1 {
			t.Errorf("expected %s < %s", rHead, r1)
		}
	})

	t.Run("insert adjacent letters", func(t *testing.T) {
		r1 := "0|a"
		r2 := "0|b"
		rMid := Between(r1, r2)
		if r1 >= rMid || rMid >= r2 {
			t.Errorf("expected %s < %s < %s", r1, rMid, r2)
		}
	})
}
