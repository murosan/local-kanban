package lexorank

import (
	"strings"
)

const (
	DefaultMinChar = 'a'
	DefaultMaxChar = 'z'
	BasePrefix     = "0|"
)

// Between calculates a rank lexicographically between prev and next.
// If prev is empty, returns a rank before next.
// If next is empty, returns a rank after prev.
// If both are empty, returns a default initial rank ("0|h00000").
func Between(prev, next string) string {
	prevStr := strings.TrimPrefix(prev, BasePrefix)
	nextStr := strings.TrimPrefix(next, BasePrefix)

	if prevStr == "" && nextStr == "" {
		return BasePrefix + "m"
	}
	if prevStr == "" {
		return BasePrefix + decrementStr(nextStr)
	}
	if nextStr == "" {
		return BasePrefix + incrementStr(prevStr)
	}

	if prevStr >= nextStr {
		// Fallback: append an increment to prev if ranks are misordered or equal
		return BasePrefix + prevStr + "m"
	}

	// Calculate middle string
	mid := middleStr(prevStr, nextStr)
	return BasePrefix + mid
}

func incrementStr(s string) string {
	runes := []rune(s)
	for i := len(runes) - 1; i >= 0; i-- {
		if runes[i] < DefaultMaxChar {
			runes[i]++
			return string(runes)
		}
		runes[i] = DefaultMinChar
	}
	return string(runes) + "m"
}

func decrementStr(s string) string {
	runes := []rune(s)
	for i := len(runes) - 1; i >= 0; i-- {
		if runes[i] > DefaultMinChar {
			runes[i]--
			return string(runes)
		}
	}
	// If all were 'a', prepend 'a' before or insert
	return "a" + string(runes)
}

func middleStr(prev, next string) string {
	var sb strings.Builder
	pLen := len(prev)
	nLen := len(next)
	maxLen := pLen
	if nLen > maxLen {
		maxLen = nLen
	}

	for i := 0; i < maxLen; i++ {
		var pChar, nChar rune
		if i < pLen {
			pChar = rune(prev[i])
		} else {
			pChar = DefaultMinChar
		}

		if i < nLen {
			nChar = rune(next[i])
		} else {
			nChar = DefaultMaxChar
		}

		if pChar == nChar {
			sb.WriteRune(pChar)
			continue
		}

		// Find midpoint character between pChar and nChar
		diff := nChar - pChar
		if diff > 1 {
			midChar := pChar + diff/2
			sb.WriteRune(midChar)
			return sb.String()
		}

		// diff == 1 (adjacent characters, e.g., 'a' and 'b')
		sb.WriteRune(pChar)
		// Check rest of prev string starting from i+1
		remPrev := ""
		if i+1 < pLen {
			remPrev = prev[i+1:]
		}
		midRest := betweenMin(remPrev)
		sb.WriteString(midRest)
		return sb.String()
	}

	// Fallback if prev is a prefix of next
	sb.WriteString("m")
	return sb.String()
}

func betweenMin(remPrev string) string {
	if remPrev == "" {
		return "m"
	}
	var sb strings.Builder
	for _, ch := range remPrev {
		if ch < DefaultMaxChar {
			diff := DefaultMaxChar - ch
			if diff > 1 {
				sb.WriteRune(ch + diff/2)
				return sb.String()
			}
			sb.WriteRune(ch)
		} else {
			sb.WriteRune(ch)
		}
	}
	sb.WriteString("m")
	return sb.String()
}
