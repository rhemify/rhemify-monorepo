package signer

import (
	"context"
	"encoding/hex"
	"fmt"
	"log"

	"github.com/rhemify/server/internal/chain"
	"github.com/rhemify/server/internal/ika"
	"github.com/rhemify/server/internal/model"
)

// ValidateStage checks the signing request fields are valid.
type ValidateStage struct{}

func (s *ValidateStage) Name() string { return "validate" }

func (s *ValidateStage) Execute(_ context.Context, sc *SigningContext) error {
	r := sc.Request
	if r.DWalletID == "" {
		return fmt.Errorf("missing dwallet_id")
	}
	if r.TargetChain == "" {
		return fmt.Errorf("missing target_chain")
	}
	if r.TargetAddress == "" {
		return fmt.Errorf("missing target_address")
	}
	if r.Amount <= 0 {
		return fmt.Errorf("amount must be positive")
	}
	return nil
}

// PolicyCheckStage evaluates policy rules (amount limits, daily caps).
type PolicyCheckStage struct {
	// MaxPerTx and DailyLimit would come from the agent wallet config.
	// For now these are checked against values passed in context.
}

func (s *PolicyCheckStage) Name() string { return "policy_check" }

func (s *PolicyCheckStage) Execute(_ context.Context, sc *SigningContext) error {
	// Policy checks will be wired to Convex data in integration phase.
	// For now, mark as passed.
	return nil
}

// IntelligenceStage runs anomaly detection and intelligence rules.
type IntelligenceStage struct{}

func (s *IntelligenceStage) Name() string { return "intelligence" }

func (s *IntelligenceStage) Execute(_ context.Context, sc *SigningContext) error {
	// Intelligence evaluation will be wired to the rules engine.
	// For now, pass through.
	return nil
}

// ApproveOnChainStage submits the approve_signing transaction to Solana.
// Also kicks off Ika presign in parallel to overlap network latency.
type ApproveOnChainStage struct {
	Cosigner  *Cosigner
	IkaClient *ika.Client
}

func (s *ApproveOnChainStage) Name() string { return "approve_on_chain" }

func (s *ApproveOnChainStage) Execute(ctx context.Context, sc *SigningContext) error {
	if s.Cosigner == nil {
		return fmt.Errorf("cosigner not configured")
	}

	// Kick off Ika presign in parallel with Solana approval (saves ~2-5s)
	type presignResult struct {
		id  string
		err error
	}
	presignCh := make(chan presignResult, 1)
	if s.IkaClient != nil {
		go func() {
			result, err := s.IkaClient.CreatePresign(ctx, sc.Request.DWalletID)
			if err != nil {
				presignCh <- presignResult{err: err}
			} else {
				presignCh <- presignResult{id: result.PresignID}
			}
		}()
	} else {
		presignCh <- presignResult{} // no-op if sidecar not configured
	}

	// Submit Solana approval (the main work of this stage)
	// In full implementation: derive PDAs, call Cosigner.ApproveSigning()
	sc.Approved = true

	// Collect presign result
	pr := <-presignCh
	if pr.err != nil {
		log.Printf("[approve_on_chain] presign pre-creation failed (non-fatal): %v", pr.err)
	} else if pr.id != "" {
		sc.PresignID = pr.id
		log.Printf("[approve_on_chain] presign pre-created: %s", pr.id)
	}

	return nil
}

// MonitorIkaStage triggers 2PC-MPC signing via the Ika sidecar and waits for completion.
type MonitorIkaStage struct {
	IkaClient *ika.Client // nil = pass-through (sidecar not configured)
}

func (s *MonitorIkaStage) Name() string { return "monitor_ika" }

func (s *MonitorIkaStage) Execute(ctx context.Context, sc *SigningContext) error {
	if s.IkaClient == nil {
		log.Println("[monitor_ika] sidecar not configured, passing through")
		return nil
	}

	r := sc.Request

	// Step 1: Use pre-created presign from ApproveOnChainStage, or create one now
	presignID := sc.PresignID
	if presignID == "" {
		presign, err := s.IkaClient.CreatePresign(ctx, r.DWalletID)
		if err != nil {
			return fmt.Errorf("create presign: %w", err)
		}
		presignID = presign.PresignID
		log.Printf("[monitor_ika] presign created (sync): %s", presignID)
	} else {
		log.Printf("[monitor_ika] using pre-created presign: %s", presignID)
	}

	// Step 2: Build the message to sign (EVM tx hash or raw payload)
	// For now, we sign a hash of the signing request parameters
	messageHex := hex.EncodeToString([]byte(fmt.Sprintf("%s:%s:%s:%.0f",
		r.TargetChain, r.TargetAddress, r.Token, r.Amount,
	)))

	// Step 3: Request the 2PC-MPC signature
	signResult, err := s.IkaClient.Sign(ctx, r.DWalletID, messageHex, presignID)
	if err != nil {
		return fmt.Errorf("request sign: %w", err)
	}
	log.Printf("[monitor_ika] sign requested: %s", signResult.SignatureID)

	// Step 4: Wait for the signature to complete
	sigHex, err := s.IkaClient.WaitForSignature(ctx, signResult.SignatureID)
	if err != nil {
		return fmt.Errorf("wait for signature: %w", err)
	}

	sc.Request.IkaSignature = sigHex
	log.Printf("[monitor_ika] signature completed: %s...", sigHex[:min(16, len(sigHex))])
	return nil
}

// BroadcastStage submits the signed transaction to the target chain.
type BroadcastStage struct {
	Registry *chain.ChainRegistry
}

func (s *BroadcastStage) Name() string { return "broadcast" }

func (s *BroadcastStage) Execute(ctx context.Context, sc *SigningContext) error {
	if s.Registry == nil {
		return fmt.Errorf("chain registry not configured")
	}
	adapter, err := s.Registry.Get(sc.Request.TargetChain)
	if err != nil {
		return err
	}
	// In full implementation, this would broadcast the Ika-signed tx.
	_ = adapter
	return nil
}

// SettlementStage writes payment events, traces, and policy decisions to Convex.
type SettlementStage struct{}

func (s *SettlementStage) Name() string { return "settlement" }

func (s *SettlementStage) Execute(_ context.Context, sc *SigningContext) error {
	// Will write to Convex:
	// - payment_event
	// - payment_trace
	// - policy_decisions
	sc.Request.Status = model.SigningStatusConfirmed
	return nil
}
