package convex

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type Client struct {
	baseURL    string
	deployKey  string
	httpClient *http.Client
}

func NewClient(deploymentURL, deployKey string) *Client {
	return &Client{
		baseURL:   deploymentURL,
		deployKey: deployKey,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

type request struct {
	Path   string      `json:"path"`
	Args   interface{} `json:"args"`
	Format string      `json:"format"`
}

type response struct {
	Status       string          `json:"status"`
	Value        json.RawMessage `json:"value"`
	ErrorMessage string          `json:"errorMessage,omitempty"`
	LogLines     []string        `json:"logLines,omitempty"`
}

// Query calls a Convex query function.
func (c *Client) Query(fnPath string, args interface{}) (json.RawMessage, error) {
	return c.call("/api/query", fnPath, args)
}

// Mutation calls a Convex mutation function.
func (c *Client) Mutation(fnPath string, args interface{}) (json.RawMessage, error) {
	return c.call("/api/mutation", fnPath, args)
}

// Action calls a Convex action function.
func (c *Client) Action(fnPath string, args interface{}) (json.RawMessage, error) {
	return c.call("/api/action", fnPath, args)
}

func (c *Client) call(endpoint, fnPath string, args interface{}) (json.RawMessage, error) {
	if args == nil {
		args = map[string]interface{}{}
	}

	body := request{
		Path:   fnPath,
		Args:   args,
		Format: "json",
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequest("POST", c.baseURL+endpoint, bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	if c.deployKey != "" {
		req.Header.Set("Authorization", "Convex "+c.deployKey)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var result response
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	if result.Status == "error" {
		return nil, fmt.Errorf("convex error: %s", result.ErrorMessage)
	}

	return result.Value, nil
}
