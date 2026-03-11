package xraymobile

import (
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	xlog "github.com/xtls/xray-core/common/log"
	xcore "github.com/xtls/xray-core/core"
	featurestats "github.com/xtls/xray-core/features/stats"
	_ "github.com/xtls/xray-core/main/distro/all"
)

const (
	maxLogLines            = 64
	outboundUplinkCounter  = "outbound>>>proxy>>>traffic>>>uplink"
	outboundDownCounter    = "outbound>>>proxy>>>traffic>>>downlink"
	inboundUplinkCounter   = "inbound>>>tun-in>>>traffic>>>uplink"
	inboundDownlinkCounter = "inbound>>>tun-in>>>traffic>>>downlink"
)

type statsSnapshot struct {
	Upload   int64  `json:"upload"`
	Download int64  `json:"download"`
	Debug    string `json:"debug"`
	Error    string `json:"error"`
	Running  bool   `json:"running"`
}

type Engine struct {
	mu         sync.Mutex
	instance   *xcore.Instance
	lastError  string
	lastDebug  string
	logLines   []string
	startedAt  int64
	activeTun  int
}

var (
	logHandlerOnce sync.Once
	activeEngineMu sync.RWMutex
	activeEngine   *Engine
)

func NewEngine() *Engine {
	installLogHandler()
	return &Engine{
		logLines: make([]string, 0, maxLogLines),
	}
}

func GetVersion() string {
	return xcore.Version()
}

func (e *Engine) Start(configJSON string, tunFD int) error {
	installLogHandler()

	e.mu.Lock()
	defer e.mu.Unlock()

	if err := e.stopLocked(false); err != nil {
		return err
	}

	if tunFD <= 0 {
		err := fmt.Errorf("invalid TUN fd: %d", tunFD)
		e.lastError = err.Error()
		return err
	}

	configJSON = strings.TrimSpace(configJSON)
	if configJSON == "" {
		err := fmt.Errorf("xray config is empty")
		e.lastError = err.Error()
		return err
	}

	e.lastError = ""
	e.lastDebug = ""
	e.logLines = e.logLines[:0]
	e.startedAt = 0
	e.activeTun = tunFD

	setActiveEngine(e)

	fdValue := strconv.Itoa(tunFD)
	if err := os.Setenv("xray.tun.fd", fdValue); err != nil {
		e.lastError = err.Error()
		clearActiveEngine(e)
		return err
	}
	if err := os.Setenv("XRAY_TUN_FD", fdValue); err != nil {
		e.lastError = err.Error()
		clearActiveEngine(e)
		return err
	}

	instance, err := xcore.StartInstance("json", []byte(configJSON))
	if err != nil {
		e.lastError = err.Error()
		e.appendLogLocked("xray start failed: " + err.Error())
		clearActiveEngine(e)
		_ = os.Unsetenv("xray.tun.fd")
		_ = os.Unsetenv("XRAY_TUN_FD")
		return err
	}

	e.instance = instance
	e.startedAt = time.Now().UnixMilli()
	e.appendLogLocked("xray instance started")
	return nil
}

func (e *Engine) Stop() string {
	e.mu.Lock()
	defer e.mu.Unlock()

	if err := e.stopLocked(true); err != nil {
		return err.Error()
	}
	return ""
}

func (e *Engine) IsRunning() bool {
	e.mu.Lock()
	defer e.mu.Unlock()

	return e.instance != nil && e.instance.IsRunning()
}

func (e *Engine) GetLastError() string {
	e.mu.Lock()
	defer e.mu.Unlock()

	return e.lastError
}

func (e *Engine) GetLastDebug() string {
	e.mu.Lock()
	defer e.mu.Unlock()

	return e.lastDebug
}

func (e *Engine) GetStartedAt() int64 {
	e.mu.Lock()
	defer e.mu.Unlock()

	return e.startedAt
}

func (e *Engine) GetStatsJSON() string {
	e.mu.Lock()
	instance := e.instance
	lastDebug := e.lastDebug
	lastError := e.lastError
	e.mu.Unlock()

	snapshot := statsSnapshot{
		Debug:   lastDebug,
		Error:   lastError,
		Running: instance != nil && instance.IsRunning(),
	}

	if instance != nil {
		if manager, ok := instance.GetFeature(featurestats.ManagerType()).(featurestats.Manager); ok {
			snapshot.Upload = readCounterValue(manager, outboundUplinkCounter, inboundUplinkCounter)
			snapshot.Download = readCounterValue(manager, outboundDownCounter, inboundDownlinkCounter)
		}
	}

	payload, err := json.Marshal(snapshot)
	if err != nil {
		return `{"upload":0,"download":0,"debug":"","error":"failed to encode stats","running":false}`
	}

	return string(payload)
}

func (e *Engine) stopLocked(clearError bool) error {
	clearActiveEngine(e)
	_ = os.Unsetenv("xray.tun.fd")
	_ = os.Unsetenv("XRAY_TUN_FD")

	if e.instance == nil {
		if clearError {
			e.lastError = ""
		}
		e.activeTun = 0
		return nil
	}

	err := e.instance.Close()
	e.instance = nil
	e.activeTun = 0
	e.startedAt = 0
	e.appendLogLocked("xray instance stopped")
	if clearError {
		e.lastError = ""
	}
	if err != nil {
		e.lastError = err.Error()
		return err
	}
	return nil
}

func (e *Engine) appendLog(line string) {
	e.mu.Lock()
	defer e.mu.Unlock()

	e.appendLogLocked(line)
}

func (e *Engine) appendLogLocked(line string) {
	line = strings.TrimSpace(line)
	if line == "" {
		return
	}

	e.lastDebug = line
	e.logLines = append(e.logLines, line)
	if len(e.logLines) > maxLogLines {
		e.logLines = append([]string(nil), e.logLines[len(e.logLines)-maxLogLines:]...)
	}

	lower := strings.ToLower(line)
	if strings.Contains(lower, " error") ||
		strings.Contains(lower, "failed") ||
		strings.Contains(lower, "[error]") {
		e.lastError = line
	}
}

func installLogHandler() {
	logHandlerOnce.Do(func() {
		xlog.RegisterHandler(engineLogHandler{})
	})
}

func setActiveEngine(engine *Engine) {
	activeEngineMu.Lock()
	defer activeEngineMu.Unlock()

	activeEngine = engine
}

func clearActiveEngine(engine *Engine) {
	activeEngineMu.Lock()
	defer activeEngineMu.Unlock()

	if activeEngine == engine {
		activeEngine = nil
	}
}

func readCounterValue(manager featurestats.Manager, primary string, secondary string) int64 {
	if counter := manager.GetCounter(primary); counter != nil {
		return counter.Value()
	}
	if counter := manager.GetCounter(secondary); counter != nil {
		return counter.Value()
	}
	return 0
}

type engineLogHandler struct{}

func (engineLogHandler) Handle(message xlog.Message) {
	activeEngineMu.RLock()
	engine := activeEngine
	activeEngineMu.RUnlock()

	if engine == nil {
		return
	}

	engine.appendLog(message.String())
}
