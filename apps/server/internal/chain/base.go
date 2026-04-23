package chain

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"strings"
)

// BaseAdapter implements ChainAdapter for Base (Sepolia).
type BaseAdapter struct {
	rpcURL     string
	httpClient *http.Client
}

func NewBaseAdapter(rpcURL string) *BaseAdapter {
	return &BaseAdapter{
		rpcURL:     rpcURL,
		httpClient: &http.Client{},
	}
}

func (a *BaseAdapter) Chain() string {
	return "base"
}

func (a *BaseAdapter) GetBalance(ctx context.Context, address string, token string) (float64, error) {
	if token == "ETH" {
		return a.getETHBalance(ctx, address)
	}
	// TODO: ERC-20 balance queries for USDC etc.
	return 0, fmt.Errorf("token %s not yet supported on base", token)
}

func (a *BaseAdapter) Broadcast(ctx context.Context, signedTx []byte) (string, error) {
	txHex := fmt.Sprintf("0x%x", signedTx)
	result, err := a.rpcCall(ctx, "eth_sendRawTransaction", []any{txHex})
	if err != nil {
		return "", fmt.Errorf("broadcast on base: %w", err)
	}
	var txHash string
	if err := json.Unmarshal(result, &txHash); err != nil {
		return "", fmt.Errorf("parse tx hash: %w", err)
	}
	return txHash, nil
}

func (a *BaseAdapter) IsConfirmed(ctx context.Context, txHash string) (bool, error) {
	result, err := a.rpcCall(ctx, "eth_getTransactionReceipt", []any{txHash})
	if err != nil {
		return false, fmt.Errorf("check confirmation on base: %w", err)
	}
	// null result means not yet confirmed
	if string(result) == "null" {
		return false, nil
	}
	var receipt struct {
		Status string `json:"status"`
	}
	if err := json.Unmarshal(result, &receipt); err != nil {
		return false, fmt.Errorf("parse receipt: %w", err)
	}
	return receipt.Status == "0x1", nil
}

func (a *BaseAdapter) getETHBalance(ctx context.Context, address string) (float64, error) {
	result, err := a.rpcCall(ctx, "eth_getBalance", []any{address, "latest"})
	if err != nil {
		return 0, err
	}
	var hexBalance string
	if err := json.Unmarshal(result, &hexBalance); err != nil {
		return 0, fmt.Errorf("parse balance: %w", err)
	}
	// Parse hex to wei using big.Int (avoids uint64 overflow for large balances)
	wei := new(big.Int)
	wei.SetString(strings.TrimPrefix(hexBalance, "0x"), 16)
	// Convert to float64 ETH (18 decimals)
	ethWei := new(big.Float).SetInt(wei)
	eth, _ := new(big.Float).Quo(ethWei, big.NewFloat(1e18)).Float64()
	return eth, nil
}

type rpcRequest struct {
	JSONRPC string `json:"jsonrpc"`
	Method  string `json:"method"`
	Params  any    `json:"params"`
	ID      int    `json:"id"`
}

type rpcResponse struct {
	Result json.RawMessage `json:"result"`
	Error  *rpcError       `json:"error,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func (a *BaseAdapter) rpcCall(ctx context.Context, method string, params any) (json.RawMessage, error) {
	body, err := json.Marshal(rpcRequest{
		JSONRPC: "2.0",
		Method:  method,
		Params:  params,
		ID:      1,
	})
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", a.rpcURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := a.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var rpcResp rpcResponse
	if err := json.NewDecoder(resp.Body).Decode(&rpcResp); err != nil {
		return nil, fmt.Errorf("decode RPC response: %w", err)
	}
	if rpcResp.Error != nil {
		return nil, fmt.Errorf("RPC error %d: %s", rpcResp.Error.Code, rpcResp.Error.Message)
	}
	return rpcResp.Result, nil
}
