package lexorank

import (
	"strings"
)

const (
	BasePrefix  = "0|"
	alphabet    = "0123456789abcdefghijklmnopqrstuvwxyz"
	base        = uint64(len(alphabet))
	fixedWidth  = 6
	fixedSpace  = base * base * base * base * base * base // 36^6 = 2,176,782,336
	defaultStep = base * base                             // 36^2 = 1,296 ("000100")
	midChar     = "i"
	InitialRank = BasePrefix + "i0000i"
	initialBody = "i0000i"
)

// Between calculates a rank lexicographically between prev and next.
// If prev is empty, returns a rank before next.
// If next is empty, returns a rank after prev.
// If both are empty, returns InitialRank ("0|i0000i").
// Callers that can rebalance a column should prefer TryBetween.
func Between(prev, next string) string {
	if rank, ok := TryBetween(prev, next); ok {
		return rank
	}

	prevBody := strings.TrimPrefix(prev, BasePrefix)
	if prevBody != "" {
		return BasePrefix + prevBody + midChar
	}
	return InitialRank
}

// TryBetween calculates a rank strictly between prev and next (when non-empty).
// Every generated rank uses Base36 ("0-9", "a-z"), starts with BasePrefix ("0|"),
// and never ends in the minimum digit ('0') so future splits remain possible.
// It returns ("", false) when no valid intermediate rank exists (such as equal,
// inverted, invalid, or exhausted minimum ranks) so the caller can rebalance.
func TryBetween(prev, next string) (string, bool) {
	prevBody, ok := parseRankBody(prev)
	if !ok {
		return "", false
	}
	nextBody, ok := parseRankBody(next)
	if !ok {
		return "", false
	}

	var body string
	switch {
	case prevBody == "" && nextBody == "":
		body = initialBody
	case prevBody == "":
		b, ok := beforeRank(nextBody)
		if !ok {
			return "", false
		}
		body = b
	case nextBody == "":
		body = afterRank(prevBody)
	default:
		if prevBody >= nextBody {
			return "", false
		}
		b, ok := middleBody(prevBody, nextBody)
		if !ok {
			return "", false
		}
		body = b
	}

	result := BasePrefix + body
	if prev != "" && result <= prev {
		return "", false
	}
	if next != "" && result >= next {
		return "", false
	}
	return result, true
}

// GenerateRanks returns evenly spaced, strictly ascending 6-digit (or wider for
// very large counts) Base36 ranks for count items.
// Every generated rank avoids ending in '0' and leaves wide headroom before the
// first item, between adjacent items, and after the last item.
func GenerateRanks(count int) []string {
	if count <= 0 {
		return []string{}
	}
	if count == 1 {
		return []string{InitialRank}
	}

	width := fixedWidth
	space := fixedSpace
	needed := uint64(count+2) * 10
	for space < needed {
		width++
		space *= base
	}

	step := space / uint64(count+1)
	ranks := make([]string, count)
	for i := range count {
		val := uint64(i+1) * step
		if val%base == 0 {
			val++
		}
		ranks[i] = BasePrefix + encodeBase36(val, width)
	}
	return ranks
}

func parseRankBody(rank string) (string, bool) {
	if rank == "" {
		return "", true
	}
	if !strings.HasPrefix(rank, BasePrefix) {
		return "", false
	}
	body := strings.TrimPrefix(rank, BasePrefix)
	if body == "" {
		return "", false
	}
	for i := 0; i < len(body); i++ {
		if _, ok := charToIdx(body[i]); !ok {
			return "", false
		}
	}
	return body, true
}

func charToIdx(b byte) (int, bool) {
	switch {
	case b >= '0' && b <= '9':
		return int(b - '0'), true
	case b >= 'a' && b <= 'z':
		return int(b-'a') + 10, true
	default:
		return 0, false
	}
}

func idxToChar(idx int) byte {
	return alphabet[idx]
}

// parseFixedPrefix interprets the first fixedWidth characters of body
// (right-padded with '0' if shorter) as a base-36 integer.
func parseFixedPrefix(body string) uint64 {
	var val uint64
	for i := range fixedWidth {
		val *= base
		if i < len(body) {
			b := body[i]
			switch {
			case b >= '0' && b <= '9':
				val += uint64(b - '0')
			case b >= 'a' && b <= 'z':
				val += uint64(b-'a') + 10
			}
		}
	}
	return val
}

func beforeRank(next string) (string, bool) {
	v := parseFixedPrefix(next)
	if v > defaultStep {
		newVal := v - defaultStep
		if newVal%base == 0 {
			newVal++
		}
		candidate := encodeBase36(newVal, fixedWidth)
		if candidate < next {
			return candidate, true
		}
	}
	return beforeMid(next)
}

func afterRank(prev string) string {
	v := parseFixedPrefix(prev)
	if v+defaultStep+1 < fixedSpace {
		newVal := v + defaultStep
		if newVal%base == 0 {
			newVal++
		}
		candidate := encodeBase36(newVal, fixedWidth)
		if candidate > prev {
			return candidate
		}
	}
	return afterMid(prev)
}

func middleBody(prev, next string) (string, bool) {
	// Keep ranks compact at fixedWidth when both fit within the fixed integer space
	// and have room for a non-'0'-terminated midpoint.
	if len(prev) <= fixedWidth && len(next) <= fixedWidth {
		vPrev := parseFixedPrefix(prev)
		vNext := parseFixedPrefix(next)
		if vPrev+1 < vNext {
			mid := vPrev + (vNext-vPrev)/2
			if mid%base == 0 {
				if mid+1 < vNext {
					mid++
				} else if mid-1 > vPrev {
					mid--
				}
			}
			if mid%base != 0 {
				candidate := encodeBase36(mid, fixedWidth)
				if candidate > prev && candidate < next {
					return candidate, true
				}
			}
		}
	}

	minLen := min(len(next), len(prev))

	for i := range minLen {
		if prev[i] == next[i] {
			continue
		}
		pIdx, _ := charToIdx(prev[i])
		nIdx, _ := charToIdx(next[i])
		if nIdx-pIdx > 1 {
			midIdx := (pIdx + nIdx) / 2
			return prev[:i] + string(idxToChar(midIdx)), true
		}
		return prev[:i+1] + afterMid(prev[i+1:]), true
	}

	tail := next[len(prev):]
	midTail, ok := beforeMid(tail)
	if !ok {
		return "", false
	}
	return prev + midTail, true
}

// beforeMid finds a string strictly between "" and tail without ending in '0'.
func beforeMid(tail string) (string, bool) {
	for i := 0; i < len(tail); i++ {
		idx, _ := charToIdx(tail[i])
		if idx > 0 {
			if idx > 1 {
				return tail[:i] + string(idxToChar(idx/2)), true
			}
			return tail[:i] + "0" + midChar, true
		}
	}
	return "", false
}

// afterMid finds a string strictly greater than rem without ending in '0'.
func afterMid(rem string) string {
	if rem == "" {
		return midChar
	}
	maxIdx := int(base - 1)
	for i := 0; i < len(rem); i++ {
		idx, _ := charToIdx(rem[i])
		if idx+1 < maxIdx {
			midIdx := (idx + maxIdx) / 2
			return rem[:i] + string(idxToChar(midIdx))
		}
	}
	return rem + midChar
}

func encodeBase36(val uint64, width int) string {
	buf := make([]byte, width)
	for i := width - 1; i >= 0; i-- {
		buf[i] = alphabet[val%base]
		val /= base
	}
	return string(buf)
}
