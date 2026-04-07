package ika

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// Client calls the Ika TypeScript sidecar over HTTP.
type Client struct {
	baseURL    string
	secret     string
	httpClient *http.Client
}

func NewClient(baseURL, secret string) *Client {
	return &Client{
		baseURL: baseURL,
		secret:  secret,
		httpClient: &http.Client{
			Timeout: 2 * time.Minute, // DKG and signing can take time
		},
	}
}

type DKGResult struct {
	DWalletID    string `json:"dwalletId"`
	DWalletCapID string `json:"dwalletCapId"`
}

type PresignResult struct {
	PresignID string `json:"presignId"`
}

type SignResult struct {
	SignatureID string `json:"signatureId"`
}

type SignatureStatus struct {
	Status       string `json:"status"`
	SignatureHex string `json:"signature_hex"`
}

// CreateDWallet triggers DKG on the Ika network via the sidecar.
func (c *Client) CreateDWallet(ctx context.Context, curve string) (*DKGResult, error) {
	body := map[string]string{}
	if curve != "" {
		body["curve"] = curve
	}
	var result DKGResult
	if err := c.post(ctx, "/dkg", body, &result); err != nil {
		return nil, fmt.Errorf("ika DKG: %w", err)
	}
	return &result, nil
}

// CreatePresign creates a presign session for a dWallet.
func (c *Client) CreatePresign(ctx context.Context, dwalletID string) (*PresignResult, error) {
	body := map[string]string{"dwallet_id": dwalletID}
	var result PresignResult
	if err := c.post(ctx, "/presign", body, &result); err != nil {
		return nil, fmt.Errorf("ika presign: %w", err)
	}
	return &result, nil
}

// Sign requests a 2PC-MPC signature from the Ika network.
func (c *Client) Sign(ctx context.Context, dwalletID, messageHex, presignID string) (*SignResult, error) {
	body := map[string]string{
		"dwallet_id":  dwalletID,
		"message_hex": messageHex,
		"presign_id":  presignID,
	}
	var result SignResult
	if err := c.post(ctx, "/sign", body, &result); err != nil {
		return nil, fmt.Errorf("ika sign: %w", err)
	}
	return &result, nil
}

// GetSignature polls for a completed signature.
func (c *Client) GetSignature(ctx context.Context, signID string) (*SignatureStatus, error) {
	var result SignatureStatus
	if err := c.get(ctx, "/signature/"+signID, &result); err != nil {
		return nil, fmt.Errorf("ika get signature: %w", err)
	}
	return &result, nil
}

// WaitForSignature polls with backoff until the signature is completed or times out.
func (c *Client) WaitForSignature(ctx context.Context, signID string) (string, error) {
	delay := 1 * time.Second
	maxDelay := 5 * time.Second
	deadline := time.After(90 * time.Second)

	for {
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-deadline:
			return "", fmt.Errorf("ika signature timeout for %s", signID)
		case <-time.After(delay):
			status, err := c.GetSignature(ctx, signID)
			if err != nil {
				continue
			}
			switch status.Status {
			case "completed":
				return status.SignatureHex, nil
			case "not_found", "pending":
				// Back off
				if delay < maxDelay {
					delay = delay * 3 / 2
					if delay > maxDelay {
						delay = maxDelay
					}
				}
				continue
			default:
				return "", fmt.Errorf("unexpected signature status: %s", status.Status)
			}
		}
	}
}

func (c *Client) post(ctx context.Context, path string, body interface{}, result interface{}) error {
	jsonBody, err := json.Marshal(body)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+path, bytes.NewReader(jsonBody))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.secret != "" {
		req.Header.Set("Authorization", "Bearer "+c.secret)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		var errResp struct{ Error string `json:"error"` }
		json.NewDecoder(resp.Body).Decode(&errResp)
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, errResp.Error)
	}

	return json.NewDecoder(resp.Body).Decode(result)
}

// GetRaw fetches raw JSON from the sidecar (for proxying responses).
func (c *Client) GetRaw(ctx context.Context, path string, result *json.RawMessage) error {
	return c.get(ctx, path, result)
}

func (c *Client) get(ctx context.Context, path string, result interface{}) error {
	req, err := http.NewRequestWithContext(ctx, "GET", c.baseURL+path, nil)
	if err != nil {
		return err
	}
	if c.secret != "" {
		req.Header.Set("Authorization", "Bearer "+c.secret)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		var errResp struct{ Error string `json:"error"` }
		json.NewDecoder(resp.Body).Decode(&errResp)
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, errResp.Error)
	}

	return json.NewDecoder(resp.Body).Decode(result)
}
