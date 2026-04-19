package replay

// ComputeDiff compares original and replayed policy outcomes rule-by-rule.
// Returns only rules where the result changed. Symmetric — catches rules
// present in only one side.
func ComputeDiff(original, replayed PolicyOutcome) []PolicyDiff {
	originalMap := make(map[string]string, len(original.RuleResults))
	for _, r := range original.RuleResults {
		originalMap[r.Rule] = r.Result
	}

	replayedMap := make(map[string]string, len(replayed.RuleResults))
	for _, r := range replayed.RuleResults {
		replayedMap[r.Rule] = r.Result
	}

	seen := make(map[string]bool)
	var diffs []PolicyDiff

	// Check rules in original
	for _, orig := range original.RuleResults {
		seen[orig.Rule] = true
		replayedResult, ok := replayedMap[orig.Rule]
		if !ok {
			replayedResult = "skipped"
		}
		if orig.Result != replayedResult {
			diffs = append(diffs, PolicyDiff{
				Rule:           orig.Rule,
				OriginalResult: orig.Result,
				ReplayedResult: replayedResult,
				Changed:        true,
			})
		}
	}

	// Check rules only in replayed (new rules from overrides)
	for _, rep := range replayed.RuleResults {
		if seen[rep.Rule] {
			continue
		}
		diffs = append(diffs, PolicyDiff{
			Rule:           rep.Rule,
			OriginalResult: "skipped",
			ReplayedResult: rep.Result,
			Changed:        true,
		})
	}

	return diffs
}
