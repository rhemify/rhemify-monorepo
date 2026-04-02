package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

type TracesHandler struct {
	db *pgxpool.Pool
}

func NewTracesHandler(db *pgxpool.Pool) *TracesHandler {
	return &TracesHandler{db: db}
}

// GET /api/traces/:id
func (h *TracesHandler) GetTrace(c *gin.Context) {
	_ = c.Param("id")
	// TODO: query payment_trace by id
	c.JSON(http.StatusOK, gin.H{"message": "not implemented"})
}
