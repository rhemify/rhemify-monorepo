package signer

import (
	"context"
	"fmt"
	"testing"

	"github.com/rhemify/server/internal/model"
)

// trackingStage records whether it was called.
type trackingStage struct {
	name    string
	called  bool
	reject  string // if non-empty, sets rejection
	failErr error  // if non-nil, returns error
}

func (s *trackingStage) Name() string { return s.name }

func (s *trackingStage) Execute(_ context.Context, sc *SigningContext) error {
	s.called = true
	if s.failErr != nil {
		return s.failErr
	}
	if s.reject != "" {
		sc.Rejection = s.reject
	}
	return nil
}

func TestPipelineAllStagesPass(t *testing.T) {
	s1 := &trackingStage{name: "stage1"}
	s2 := &trackingStage{name: "stage2"}
	s3 := &trackingStage{name: "stage3"}

	pipeline := NewSigningPipeline(s1, s2, s3)
	sc := &SigningContext{
		Request: &model.SigningRequest{Status: model.SigningStatusPending},
	}

	err := pipeline.Execute(context.Background(), sc)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !s1.called || !s2.called || !s3.called {
		t.Fatal("all stages should have been called")
	}
	if sc.Rejection != "" {
		t.Fatal("no rejection expected")
	}
}

func TestPipelineStopsOnRejection(t *testing.T) {
	s1 := &trackingStage{name: "stage1"}
	s2 := &trackingStage{name: "stage2", reject: "amount exceeds daily limit"}
	s3 := &trackingStage{name: "stage3"}

	pipeline := NewSigningPipeline(s1, s2, s3)
	sc := &SigningContext{
		Request: &model.SigningRequest{Status: model.SigningStatusPending},
	}

	err := pipeline.Execute(context.Background(), sc)
	if err != nil {
		t.Fatalf("rejection should not be an error, got: %v", err)
	}
	if !s1.called {
		t.Fatal("stage1 should have been called")
	}
	if !s2.called {
		t.Fatal("stage2 should have been called")
	}
	if s3.called {
		t.Fatal("stage3 should NOT have been called after rejection")
	}
	if sc.Rejection != "amount exceeds daily limit" {
		t.Fatalf("expected rejection reason, got %q", sc.Rejection)
	}
}

func TestPipelineStopsOnError(t *testing.T) {
	s1 := &trackingStage{name: "stage1"}
	s2 := &trackingStage{name: "stage2", failErr: fmt.Errorf("rpc timeout")}
	s3 := &trackingStage{name: "stage3"}

	pipeline := NewSigningPipeline(s1, s2, s3)
	sc := &SigningContext{
		Request: &model.SigningRequest{Status: model.SigningStatusPending},
	}

	err := pipeline.Execute(context.Background(), sc)
	if err == nil {
		t.Fatal("expected error")
	}
	if !s1.called || !s2.called {
		t.Fatal("stages 1 and 2 should have been called")
	}
	if s3.called {
		t.Fatal("stage3 should NOT have been called after error")
	}
}

func TestPipelineWithRealStages(t *testing.T) {
	// Test with the actual ValidateStage
	pipeline := NewSigningPipeline(
		&ValidateStage{},
		&PolicyCheckStage{},
		&IntelligenceStage{},
	)

	// Valid request passes all stages
	sc := &SigningContext{
		Request: &model.SigningRequest{
			DWalletID:     "dwallet-abc",
			TargetChain:   "base",
			TargetAddress: "0x1234",
			Amount:        100.0,
			Status:        model.SigningStatusPending,
		},
	}
	if err := pipeline.Execute(context.Background(), sc); err != nil {
		t.Fatalf("valid request should pass: %v", err)
	}

	// Invalid request (missing target chain) fails at validation
	sc2 := &SigningContext{
		Request: &model.SigningRequest{
			DWalletID:     "dwallet-abc",
			TargetAddress: "0x1234",
			Amount:        100.0,
		},
	}
	if err := pipeline.Execute(context.Background(), sc2); err == nil {
		t.Fatal("expected validation error for missing target_chain")
	}
}
