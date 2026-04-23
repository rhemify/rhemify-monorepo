package signer

import (
	"context"
	"fmt"
	"log"

	"github.com/rhemify/server/internal/model"
)

// SigningContext carries data through the pipeline stages.
type SigningContext struct {
	Request   *model.SigningRequest
	Approved  bool
	Rejection string // non-empty = rejected, pipeline stops
	TxHash    string // target chain tx hash after broadcast
	PresignID string // pre-created Ika presign (set by ApproveOnChainStage for overlap)
}

// SigningStage is a single step in the signing pipeline.
type SigningStage interface {
	Name() string
	Execute(ctx context.Context, sc *SigningContext) error
}

// SigningPipeline executes stages in order, stopping on rejection or error.
type SigningPipeline struct {
	stages []SigningStage
}

func NewSigningPipeline(stages ...SigningStage) *SigningPipeline {
	return &SigningPipeline{stages: stages}
}

// Execute runs all stages in order. Stops on first error or rejection.
func (p *SigningPipeline) Execute(ctx context.Context, sc *SigningContext) error {
	for _, stage := range p.stages {
		log.Printf("[pipeline] executing stage: %s", stage.Name())

		if err := stage.Execute(ctx, sc); err != nil {
			log.Printf("[pipeline] stage %s failed: %v", stage.Name(), err)
			return fmt.Errorf("stage %s: %w", stage.Name(), err)
		}

		if sc.Rejection != "" {
			log.Printf("[pipeline] stage %s rejected: %s", stage.Name(), sc.Rejection)
			return nil // rejection is not an error, pipeline just stops
		}

		log.Printf("[pipeline] stage %s completed", stage.Name())
	}
	return nil
}
