package main

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// UE Pixel Streaming 专用信令，与视频会议 /ws 完全隔离。

type UeClient struct {
	ID       string
	SceneID  string
	Conn     *websocket.Conn
	Send     chan []byte
	Username string
}

type UeScene struct {
	ID        string
	PlayerURL string
	Viewers   map[string]*UeClient
	mu        sync.RWMutex
}

type UeHub struct {
	Scenes     map[string]*UeScene
	Register   chan *UeClient
	Unregister chan *UeClient
	mu         sync.RWMutex
}

type UeMessage struct {
	Type     string      `json:"type"`
	SceneID  string      `json:"sceneId,omitempty"`
	UserID   string      `json:"userId,omitempty"`
	Username string      `json:"username,omitempty"`
	Data     interface{} `json:"data,omitempty"`
}

func newUeHub() *UeHub {
	return &UeHub{
		Scenes:     make(map[string]*UeScene),
		Register:   make(chan *UeClient),
		Unregister: make(chan *UeClient),
	}
}

func (h *UeHub) run() {
	for {
		select {
		case client := <-h.Register:
			h.mu.Lock()
			scene, ok := h.Scenes[client.SceneID]
			if !ok {
				scene = &UeScene{
					ID:      client.SceneID,
					Viewers: make(map[string]*UeClient),
				}
				h.Scenes[client.SceneID] = scene
			}
			scene.mu.Lock()
			scene.Viewers[client.ID] = client
			playerURL := scene.PlayerURL
			scene.mu.Unlock()
			h.mu.Unlock()

			if playerURL != "" {
				msg, _ := json.Marshal(&UeMessage{Type: "scene-embed", Data: playerURL})
				select {
				case client.Send <- msg:
				default:
					close(client.Send)
				}
			}

		case client := <-h.Unregister:
			h.mu.Lock()
			if scene, ok := h.Scenes[client.SceneID]; ok {
				scene.mu.Lock()
				if _, exists := scene.Viewers[client.ID]; exists {
					delete(scene.Viewers, client.ID)
					close(client.Send)
					if len(scene.Viewers) == 0 {
						delete(h.Scenes, client.SceneID)
					}
				}
				scene.mu.Unlock()
			}
			h.mu.Unlock()
		}
	}
}

func (h *UeHub) broadcastScene(sceneID string, message *UeMessage, excludeUserID string) {
	h.mu.RLock()
	scene, ok := h.Scenes[sceneID]
	h.mu.RUnlock()
	if !ok {
		return
	}

	data, err := json.Marshal(message)
	if err != nil {
		return
	}

	scene.mu.RLock()
	for id, c := range scene.Viewers {
		if id != excludeUserID {
			select {
			case c.Send <- data:
			default:
				close(c.Send)
				delete(scene.Viewers, id)
			}
		}
	}
	scene.mu.RUnlock()
}

func (h *UeHub) setSceneEmbed(client *UeClient, message *UeMessage) {
	var urlStr string
	switch d := message.Data.(type) {
	case string:
		urlStr = d
	case map[string]interface{}:
		if v, ok := d["embedUrl"].(string); ok {
			urlStr = v
		}
	}
	h.mu.Lock()
	scene, ok := h.Scenes[client.SceneID]
	h.mu.Unlock()
	if !ok {
		return
	}
	scene.mu.Lock()
	scene.PlayerURL = urlStr
	scene.mu.Unlock()
	h.broadcastScene(client.SceneID, &UeMessage{Type: "scene-embed", Data: urlStr}, client.ID)
}

func (c *UeClient) ueWritePump() {
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

func (c *UeClient) ueReadPump(hub *UeHub) {
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
		var message UeMessage
		if err := json.Unmarshal(messageBytes, &message); err != nil {
			continue
		}
		message.UserID = c.ID
		message.SceneID = c.SceneID
		if message.Type == "set-scene-embed" {
			hub.setSceneEmbed(c, &message)
		}
	}
}

func serveUeWS(hub *UeHub, w http.ResponseWriter, r *http.Request) {
	log.Printf("UE WebSocket connect: %s", r.URL.String())

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("UE WebSocket upgrade fail: %v", err)
		return
	}

	userID := r.URL.Query().Get("userId")
	sceneID := r.URL.Query().Get("sceneId")
	if sceneID == "" {
		sceneID = r.URL.Query().Get("roomId") // 兼容旧参数名
	}
	username := r.URL.Query().Get("username")
	if username == "" {
		username = "viewer"
	}

	if userID == "" || sceneID == "" {
		conn.Close()
		return
	}

	client := &UeClient{
		ID:       userID,
		SceneID:  sceneID,
		Conn:     conn,
		Send:     make(chan []byte, 256),
		Username: username,
	}

	hub.Register <- client
	go client.ueWritePump()
	go client.ueReadPump(hub)
}
