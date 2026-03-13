package v2ray

import (
	"fmt"
	"os"
	"sync"
)

type V2RayInstance struct {
	mu       sync.Mutex
	running  bool
	upload   int64
	download int64
}

var (
	globalInstance *V2RayInstance
	instanceMu     sync.Mutex
)

func NewInstance() *V2RayInstance {
	instanceMu.Lock()
	defer instanceMu.Unlock()

	if globalInstance == nil {
		globalInstance = &V2RayInstance{}
	}
	return globalInstance
}

func (v *V2RayInstance) Start(configJSON string, tunFd int) error {
	v.mu.Lock()
	defer v.mu.Unlock()

	if v.running {
		return fmt.Errorf("instance already running")
	}

	if tunFd > 0 {
		os.Setenv("V2RAY_TUN_FD", fmt.Sprintf("%d", tunFd))
	}

	v.running = true
	return nil
}

func (v *V2RayInstance) Stop() error {
	v.mu.Lock()
	defer v.mu.Unlock()

	v.running = false
	return nil
}

func (v *V2RayInstance) IsRunning() bool {
	v.mu.Lock()
	defer v.mu.Unlock()
	return v.running
}

func (v *V2RayInstance) GetUpload() int64 {
	v.mu.Lock()
	defer v.mu.Unlock()
	return v.upload
}

func (v *V2RayInstance) GetDownload() int64 {
	v.mu.Lock()
	defer v.mu.Unlock()
	return v.download
}

func StartV2Ray(configJSON string, tunFd int) error {
	instance := NewInstance()
	return instance.Start(configJSON, tunFd)
}

func StopV2Ray() error {
	instance := NewInstance()
	return instance.Stop()
}

func IsRunning() bool {
	instance := NewInstance()
	return instance.IsRunning()
}

func GetUpload() int64 {
	instance := NewInstance()
	return instance.GetUpload()
}

func GetDownload() int64 {
	instance := NewInstance()
	return instance.GetDownload()
}
