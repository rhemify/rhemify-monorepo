package replay

// ComputeDiff compares original and replayed policy outcomes rule-by-rule.
// Returns only rules where the result changed.
func ComputeDiff(original, replayed PolicyOutcome) []PolicyDiff {
	replayedMap := make(map[string]string, len(replayed.RuleResults))
	for _, r := range replayed.RuleResults {
		replayedMap[r.Rule] = r.Result
	}

	var diffs []PolicyDiff
	for _, orig := range original.RuleResults {
		replayedResult, ok := replayedMap[orig.Rule]
		if !ok {
			replayedResult = "skipped"
		}
		changed := orig.Result != replayedResult
		if changed {
			diffs = append(diffs, PolicyDiff{
				Rule:           orig.Rule,
				OriginalResult: orig.Result,
				ReplayedResult: replayedResult,
				Changed:        true,
			})
		}
	}
	return diffs
}
