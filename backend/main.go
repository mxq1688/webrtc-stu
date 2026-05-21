package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/rs/cors"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Client struct {
	ID       string
	RoomID   string
	Conn     *websocket.Conn
	Send     chan []byte
	Username string
	Role     string
}

type Room struct {
	ID           string
	Clients      map[string]*Client
	ScreenSharer string
	mu           sync.RWMutex
}

type Hub struct {
	Rooms      map[string]*Room
	Register   chan *Client
	Unregister chan *Client
	Broadcast  chan *Message
	mu         sync.RWMutex
}

type Message struct {
	Type         string      `json:"type"`
	RoomID       string      `json:"roomId,omitempty"`
	UserID       string      `json:"userId,omitempty"`
	Username     string      `json:"username,omitempty"`
	TargetUserID string      `json:"targetUserId,omitempty"`
	Data         interface{} `json:"data,omitempty"`
}

func newHub() *Hub {
	return &Hub{
		Rooms:      make(map[string]*Room),
		Register:   make(chan *Client, 64),
		Unregister: make(chan *Client, 64),
		Broadcast:  make(chan *Message, 256),
	}
}

func (h *Hub) run() {
	for {
		select {
		case client := <-h.Register:
			h.handleRegister(client)
		case client := <-h.Unregister:
			h.handleUnregister(client)
		case message := <-h.Broadcast:
			h.broadcastToRoom(message.RoomID, message, message.UserID)
		}
	}
}

func (h *Hub) handleRegister(client *Client) {
	h.mu.Lock()
	room, exists := h.Rooms[client.RoomID]
	if !exists {
		room = &Room{
			ID:      client.RoomID,
			Clients: make(map[string]*Client),
		}
		h.Rooms[client.RoomID] = room
	}
	room.mu.Lock()
	replacedStale := false
	if old, exists := room.Clients[client.ID]; exists && old != client {
		log.Printf("replace stale client room=%s id=%s", client.RoomID, client.ID)
		replacedStale = true
		close(old.Send)
		go old.Conn.Close()
	}
	room.Clients[client.ID] = client
	total := len(room.Clients)
	roomID := client.RoomID
	clientID := client.ID
	room.mu.Unlock()
	h.mu.Unlock()

	if replacedStale {
		h.broadcastToRoom(roomID, &Message{
			Type:   "user-left",
			UserID: clientID,
		}, "")
	}

	log.Printf("user joined room=%s id=%s name=%s (total=%d)", roomID, clientID, client.Username, total)
	h.broadcastToRoom(roomID, &Message{
		Type:     "user-joined",
		UserID:   clientID,
		Username: client.Username,
		Data:     map[string]string{"role": client.Role},
	}, clientID)

	userList := h.getUserList(roomID)
	userListMsg, _ := json.Marshal(&Message{Type: "user-list", Data: userList})
	select {
	case client.Send <- userListMsg:
	default:
		close(client.Send)
	}

	h.mu.RLock()
	room, _ = h.Rooms[roomID]
	h.mu.RUnlock()
	if room != nil {
		room.mu.RLock()
		screenSharer := room.ScreenSharer
		room.mu.RUnlock()
		if screenSharer != "" {
			ssMsg, _ := json.Marshal(&Message{Type: "screen-share-start", Data: map[string]string{"userId": screenSharer}})
			select {
			case client.Send <- ssMsg:
			default:
				close(client.Send)
			}
		}
	}
}

func (h *Hub) handleUnregister(client *Client) {
	h.mu.Lock()
	room, exists := h.Rooms[client.RoomID]
	if !exists {
		h.mu.Unlock()
		return
	}
	room.mu.Lock()
	roomID := client.RoomID
	clientID := client.ID
	shouldBroadcastLeave := false
	remain := 0
	if existing, ok := room.Clients[clientID]; ok && existing == client {
		delete(room.Clients, clientID)
		close(client.Send)
		if room.ScreenSharer == clientID {
			room.ScreenSharer = ""
		}
		remain = len(room.Clients)
		if remain == 0 {
			delete(h.Rooms, roomID)
		} else {
			shouldBroadcastLeave = true
		}
	}
	room.mu.Unlock()
	h.mu.Unlock()

	if shouldBroadcastLeave {
		log.Printf("user left room=%s id=%s (remain=%d)", roomID, clientID, remain)
		h.broadcastToRoom(roomID, &Message{
			Type:   "user-left",
			UserID: clientID,
		}, "")
	}
}

func (h *Hub) broadcastToRoom(roomID string, message *Message, excludeUserID string) {
	h.mu.RLock()
	room, exists := h.Rooms[roomID]
	h.mu.RUnlock()

	if !exists {
		return
	}

	data, err := json.Marshal(message)
	if err != nil {
		return
	}

	room.mu.RLock()
	if message.TargetUserID != "" {
		if client, exists := room.Clients[message.TargetUserID]; exists {
			select {
			case client.Send <- data:
			default:
				close(client.Send)
				delete(room.Clients, message.TargetUserID)
			}
		} else {
			log.Printf("signal %s target %s not in room %s (clients=%d)", message.Type, message.TargetUserID, roomID, len(room.Clients))
		}
	} else {
		for clientID, client := range room.Clients {
			if clientID != excludeUserID {
				select {
				case client.Send <- data:
				default:
					close(client.Send)
					delete(room.Clients, clientID)
				}
			}
		}
	}
	room.mu.RUnlock()
}

func (h *Hub) getUserList(roomID string) []map[string]string {
	h.mu.RLock()
	room, exists := h.Rooms[roomID]
	h.mu.RUnlock()

	if !exists {
		return []map[string]string{}
	}

	var users []map[string]string
	room.mu.RLock()
	for _, client := range room.Clients {
		users = append(users, map[string]string{
			"id":       client.ID,
			"username": client.Username,
			"role":     client.Role,
		})
	}
	room.mu.RUnlock()
	return users
}

func (h *Hub) handleRoleChange(client *Client, message *Message) {
	var newRole string
	switch d := message.Data.(type) {
	case string:
		newRole = d
	case map[string]interface{}:
		if v, ok := d["role"].(string); ok {
			newRole = v
		}
	}
	if newRole != "anchor" && newRole != "audience" {
		return
	}
	h.mu.RLock()
	room, exists := h.Rooms[client.RoomID]
	h.mu.RUnlock()
	if !exists {
		return
	}
	room.mu.Lock()
	client.Role = newRole
	room.mu.Unlock()
	h.broadcastToRoom(client.RoomID, &Message{
		Type:   "role-changed",
		UserID: client.ID,
		Data:   map[string]string{"role": newRole},
	}, "")
}

func (h *Hub) handleScreenShareStart(client *Client, message *Message) {
	h.mu.RLock()
	room, exists := h.Rooms[client.RoomID]
	h.mu.RUnlock()
	if !exists {
		return
	}
	room.mu.Lock()
	room.ScreenSharer = client.ID
	room.mu.Unlock()
	h.broadcastToRoom(client.RoomID, &Message{
		Type:   "screen-share-start",
		UserID: client.ID,
		Data:   map[string]string{"userId": client.ID},
	}, client.ID)
}

func (h *Hub) handleScreenShareStop(client *Client, message *Message) {
	h.mu.RLock()
	room, exists := h.Rooms[client.RoomID]
	h.mu.RUnlock()
	if !exists {
		return
	}
	room.mu.Lock()
	if room.ScreenSharer == client.ID {
		room.ScreenSharer = ""
	}
	room.mu.Unlock()
	h.broadcastToRoom(client.RoomID, &Message{
		Type:   "screen-share-stop",
		UserID: client.ID,
		Data:   map[string]string{"userId": client.ID},
	}, "")
}

func (c *Client) writePump() {
	defer c.Conn.Close()
	ticker := time.NewTicker(54 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case message, ok := <-c.Send:
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			c.Conn.WriteMessage(websocket.TextMessage, message)
		case <-ticker.C:
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Client) readPump(hub *Hub) {
	defer func() {
		hub.Unregister <- c
		c.Conn.Close()
	}()
	c.Conn.SetReadLimit(65536)
	c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, messageBytes, err := c.Conn.ReadMessage()
		if err != nil {
			break
		}

		var message Message
		if err := json.Unmarshal(messageBytes, &message); err != nil {
			continue
		}

		message.UserID = c.ID
		message.RoomID = c.RoomID

		switch message.Type {
		case "offer", "answer", "ice-candidate":
			log.Printf("signal %s room=%s from=%s to=%s", message.Type, c.RoomID, c.ID, message.TargetUserID)
			msg := message
			go hub.broadcastToRoom(c.RoomID, &msg, msg.UserID)
		case "change-role":
			hub.handleRoleChange(c, &message)
		case "screen-share-start":
			hub.handleScreenShareStart(c, &message)
		case "screen-share-stop":
			hub.handleScreenShareStop(c, &message)
		case "chat":
			hub.Broadcast <- &message
		}
	}
}

func serveWS(hub *Hub, w http.ResponseWriter, r *http.Request) {
	log.Printf("WebSocket connect: %s", r.URL.String())

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade fail: %v", err)
		return
	}

	userID := r.URL.Query().Get("userId")
	roomID := r.URL.Query().Get("roomId")
	username := r.URL.Query().Get("username")
	role := r.URL.Query().Get("role")
	if role == "" {
		role = "anchor"
	}

	if userID == "" || roomID == "" || username == "" {
		conn.Close()
		return
	}

	client := &Client{
		ID:       userID,
		RoomID:   roomID,
		Conn:     conn,
		Send:     make(chan []byte, 256),
		Username: username,
		Role:     role,
	}

	hub.Register <- client

	go client.writePump()
	go client.readPump(hub)
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func corsOrigins() []string {
	if raw := os.Getenv("ALLOWED_ORIGINS"); raw != "" {
		parts := strings.Split(raw, ",")
		out := make([]string, 0, len(parts))
		for _, p := range parts {
			if s := strings.TrimSpace(p); s != "" {
				out = append(out, s)
			}
		}
		if len(out) > 0 {
			return out
		}
	}
	return []string{
		"https://localhost:3000",
		"http://localhost:3000",
		"https://127.0.0.1:3000",
		"https://192.168.5.27:3000",
		"https://192.168.5.46:3000",
		"http://192.168.5.46:3000",
	}
}

func main() {
	hub := newHub()
	go hub.run()

	ueHub := newUeHub()
	go ueHub.run()

	router := mux.NewRouter()

	c := cors.New(cors.Options{
		AllowedOrigins:   corsOrigins(),
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: true,
	})

	router.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		serveWS(hub, w, r)
	})

	router.HandleFunc("/ws/ue", func(w http.ResponseWriter, r *http.Request) {
		serveUeWS(ueHub, w, r)
	})

	router.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	router.HandleFunc("/health/ue", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	handler := c.Handler(router)
	httpPort := envOr("HTTP_PORT", "8080")
	tlsEnabled := envOr("TLS_ENABLED", "true") == "true"
	tlsCert := envOr("TLS_CERT", "localhost+1.pem")
	tlsKey := envOr("TLS_KEY", "localhost+1-key.pem")

	addr := ":" + httpPort
	if !tlsEnabled {
		log.Printf("HTTP server on %s (TLS disabled, use Ingress TLS)", addr)
		log.Fatal(http.ListenAndServe(addr, handler))
	}

	go func() {
		log.Printf("HTTP server on %s", addr)
		if err := http.ListenAndServe(addr, handler); err != nil {
			log.Printf("HTTP error: %v", err)
		}
	}()

	log.Printf("HTTPS server on :8443")
	if err := http.ListenAndServeTLS(":8443", tlsCert, tlsKey, handler); err != nil {
		log.Fatal("HTTPS error:", err)
	}
}
