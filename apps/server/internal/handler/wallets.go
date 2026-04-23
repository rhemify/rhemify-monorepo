package handler

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
	cx "github.com/rhemify/server/internal/convex"
	"github.com/rhemify/server/internal/signer"
	solclient "github.com/rhemify/server/internal/solana"
)

type WalletHandler struct {
	convex   *cx.Client
	cosigner *signer.Cosigner
}

func NewWalletHandler(convex *cx.Client, cosigner *signer.Cosigner) *WalletHandler {
	return &WalletHandler{convex: convex, cosigner: cosigner}
}

type createFleetRequest struct {
	FleetID           string `json:"fleet_id" binding:"required"`
	TreasuryDWalletID string `json:"treasury_dwallet_id" binding:"required"`
	DailyCap          uint64 `json:"daily_cap" binding:"required"`
}

// POST /api/wallets/create-fleet
func (h *WalletHandler) CreateFleet(c *gin.Context) {
	var req createFleetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "internal error"})
		return
	}

	programID := h.cosigner.PublicKey() // placeholder — will use config program ID
	fleetVault, _, err := solclient.FleetVaultPDA(programID, req.FleetID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	// Insert into Convex
	_, err = h.convex.Mutation("dwallets:createFleetVault", map[string]interface{}{
		"fleet_id":           req.FleetID,
		"dwallet_type":       "treasury",
		"dwallet_id":         req.TreasuryDWalletID,
		"dwallet_cap_id":     fleetVault.String(),
		"supported_chains":   []string{"base", "ethereum", "arbitrum"},
		"status":             "creating",
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"fleet_vault_pda": fleetVault.String(),
		"status":          "creating",
		"message":         "fleet vault creation initiated",
	})
}

type createAgentWalletRequest struct {
	FleetID       string   `json:"fleet_id" binding:"required"`
	AgentKey      string   `json:"agent_key" binding:"required"`
	DWalletID     string   `json:"dwallet_id" binding:"required"`
	MaxPerTx      uint64   `json:"max_per_tx" binding:"required"`
	DailyLimit    uint64   `json:"daily_limit" binding:"required"`
	AllowedChains []string `json:"allowed_chains" binding:"required"`
}

// POST /api/wallets/create-agent
func (h *WalletHandler) CreateAgentWallet(c *gin.Context) {
	var req createAgentWalletRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "internal error"})
		return
	}

	programID := h.cosigner.PublicKey() // placeholder
	agentWallet, _, err := solclient.AgentWalletPDA(programID, req.FleetID, req.AgentKey)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	_, err = h.convex.Mutation("dwallets:createAgentWallet", map[string]interface{}{
		"fleet_id":         req.FleetID,
		"agent_key":        req.AgentKey,
		"dwallet_type":     "agent",
		"dwallet_id":       req.DWalletID,
		"dwallet_cap_id":   agentWallet.String(),
		"supported_chains": req.AllowedChains,
		"status":           "creating",
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	// Derive SNS identity domain if parent domain is configured
	snsDomain := ""
	if req.FleetID != "" && req.AgentKey != "" {
		snsDomain = req.AgentKey + "." + req.FleetID + ".sol"
	}

	c.JSON(http.StatusCreated, gin.H{
		"agent_wallet_pda": agentWallet.String(),
		"identity_domain":  snsDomain,
		"status":           "creating",
		"message":          "agent wallet creation initiated",
	})
}

type freezeAgentRequest struct {
	FleetID  string `json:"fleet_id" binding:"required"`
	AgentKey string `json:"agent_key" binding:"required"`
}

// POST /api/wallets/freeze
func (h *WalletHandler) FreezeAgent(c *gin.Context) {
	var req freezeAgentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "internal error"})
		return
	}

	programID := h.cosigner.PublicKey() // placeholder
	fleetVault, _, err := solclient.FleetVaultPDA(programID, req.FleetID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	agentWallet, _, err := solclient.AgentWalletPDA(programID, req.FleetID, req.AgentKey)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	sig, err := h.cosigner.FreezeAgent(c.Request.Context(), fleetVault, agentWallet, req.FleetID, req.AgentKey)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	// Update Convex status
	_, _ = h.convex.Mutation("dwallets:updateStatus", map[string]interface{}{
		"fleet_id":  req.FleetID,
		"agent_key": req.AgentKey,
		"status":    "frozen",
	})

	c.JSON(http.StatusOK, gin.H{
		"signature": sig.String(),
		"status":    "frozen",
	})
}

// GET /api/wallets/:fleetId
func (h *WalletHandler) ListWallets(c *gin.Context) {
	fleetID := c.Param("fleetId")

	result, err := h.convex.Query("dwallets:listByFleet", map[string]string{
		"fleet_id": fleetID,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	var wallets interface{}
	if err := json.Unmarshal(result, &wallets); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, wallets)
}

// GET /api/wallets/:fleetId/:agentKey
func (h *WalletHandler) GetAgentWallet(c *gin.Context) {
	fleetID := c.Param("fleetId")
	agentKey := c.Param("agentKey")

	result, err := h.convex.Query("dwallets:getAgentWallet", map[string]string{
		"fleet_id":  fleetID,
		"agent_key": agentKey,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	var wallet interface{}
	if err := json.Unmarshal(result, &wallet); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, wallet)
}

