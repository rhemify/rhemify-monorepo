package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

type EventsHandler struct {
	db *pgxpool.Pool
}

func NewEventsHandler(db *pgxpool.Pool) *EventsHandler {
	return &EventsHandler{db: db}
}

// GET /api/events — paginated, filterable by agent_id, outcome, standard, domain
func (h *EventsHandler) ListEvents(c *gin.Context) {
	// TODO: implement with pagination + filters from query params
	// ?page=1&per_page=50&agent_id=&outcome=&standard=&domain=
	c.JSON(http.StatusOK, gin.H{"message": "not implemented"})
}

// GET /api/events/:id — single event with linked trace
func (h *EventsHandler) GetEvent(c *gin.Context) {
	_ = c.Param("id")
	// TODO: query payment_event joined with payment_trace
	c.JSON(http.StatusOK, gin.H{"message": "not implemented"})
}
