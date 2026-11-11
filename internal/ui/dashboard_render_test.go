package ui

import (
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

func TestDashboardChineseLayout(t *testing.T) {
	var capture strings.Builder
	for _, width := range []int{80, 120} {
		dash := demoDashboard(width, 24)
		if got := NewDashboard("2.3.0", 5001, false, nil, nil).View(); got != "正在初始化..." {
			t.Fatalf("unready view = %q", got)
		}

		pages := []struct {
			name string
			tab  ViewTab
		}{
			{"日志", TabLogs},
			{"统计", TabStats},
			{"配置", TabConfig},
		}
		for _, page := range pages {
			dash.currentTab = page.tab
			view := dash.View()
			assertLineWidths(t, view, width)
			fmt.Fprintf(&capture, "===== %d 列 %s =====\n%s\n\n", width, page.name, stripANSI(view))
		}

		searching := dash
		searching.currentTab = TabLogs
		searching.searching = true
		searching.searchInput.Focus()
		searchView := searching.View()
		assertLineWidths(t, searchView, width)
		fmt.Fprintf(&capture, "===== %d 列 搜索 =====\n%s\n\n", width, stripANSI(searchView))

		plainLogs := stripANSI(dashView(dash, TabLogs))
		for _, want := range []string{
			"OpenRadar v2.3.0",
			"模式: 开发",
			"抓包:",
			"启动:",
			"(局域网)",
			"[1] 日志",
			"[2] 统计",
			"[3] 配置",
			"筛选: ALL",
			"已暂停",
			"q:退出",
			"包:",
			"堆:",
			"系统:",
			"运行:",
			"批次:",
			"WS:",
			"错误:",
			"日志:",
			"[APP]",
		} {
			if !strings.Contains(plainLogs, want) {
				t.Errorf("width %d logs view missing %q", width, want)
			}
		}
		if strings.Contains(plainLogs, "Mode:") || strings.Contains(plainLogs, "PAUSED") || strings.Contains(plainLogs, "Filter:") {
			t.Errorf("width %d logs view still has English chrome:\n%s", width, plainLogs)
		}

		plainStats := stripANSI(dash.renderStatsView())
		assertSameValueColumn(t, plainStats, []string{
			"运行时间:", "数据包:", "包/秒:", "错误:", "错误率:",
			"客户端:", "批次:", "批次/秒:", "消息:", "每批平均:", "队列:",
			"接收总量:", "接收/秒:", "发送总量:", "发送/秒:",
		}, 0, 30)
		assertSameValueColumn(t, plainStats, []string{"条目:", "批次:", "缓冲区:"}, 30, 1000)
		for _, want := range []string{"服务器", "WebSocket", "流量", "堆内存 MB", "系统内存 MB", "最小:", "平均:", "最大:"} {
			if !strings.Contains(plainStats, want) {
				t.Errorf("width %d stats view missing %q", width, want)
			}
		}

		plainConfig := stripANSI(dash.renderConfigView())
		assertSameValueColumn(t, plainConfig, []string{
			"版本:", "模式:", "HTTP 地址:", "WS 地址:", "抓包:", "局域网:",
		}, 0, 30)
		assertSameValueColumn(t, plainConfig, []string{
			"q", "r", "p", "c", "f", "/", "↑↓", "g/G", "1-3", "tab",
		}, 30, 1000)
		for _, want := range []string{
			"配置", "关于", "OpenRadar - Albion Online", "实时数据包雷达",
			"快捷键", "退出程序", "重启程序", "搜索日志",
			"日志级别", "INFO", "SUCCESS", "WARN", "ERROR",
		} {
			if !strings.Contains(plainConfig, want) {
				t.Errorf("width %d config view missing %q", width, want)
			}
		}

		plainSearch := stripANSI(searchView)
		if !strings.Contains(plainSearch, "搜索日志...") {
			t.Errorf("width %d search view missing placeholder:\n%s", width, plainSearch)
		}
	}

	if path := os.Getenv("OPENRADAR_DASHBOARD_CAPTURE"); path != "" {
		if err := os.WriteFile(path, []byte(capture.String()), 0o644); err != nil {
			t.Fatalf("write capture: %v", err)
		}
	}
}

func TestEmptyDashboardCopy(t *testing.T) {
	d := NewDashboard("2.3.0", 5001, true, nil, nil)
	updated, _ := d.Update(tea.WindowSizeMsg{Width: 80, Height: 24})
	dash := updated.(Dashboard)
	logs := stripANSI(dash.View())
	if !strings.Contains(logs, "等待日志...") {
		t.Errorf("empty logs = %q", logs)
	}
	if got := formatCaptureLine(nil); got != "(等待中)" {
		t.Errorf("formatCaptureLine = %q", got)
	}
	stats := stripANSI(dash.renderStatsView())
	if !strings.Contains(stats, "无数据") {
		t.Errorf("empty stats missing 无数据:\n%s", stats)
	}
}

func demoDashboard(width, height int) Dashboard {
	d := NewDashboard("2.3.0", 5001, true, []string{"10.0.0.1"}, []CaptureSummary{
		{Description: "eth0", Address: "10.0.0.1", Category: "ethernet"},
	})
	d.startTime = time.Now().Add(-90 * time.Second)
	d.autoScroll = false
	updated, _ := d.Update(tea.WindowSizeMsg{Width: width, Height: height})
	dash := updated.(Dashboard)

	messages := []tea.Msg{
		LogMsg{Level: "INFO", Tag: "APP", Message: "正在启动服务"},
		LogMsg{Level: "SUCCESS", Tag: "HTTP", Message: "服务器: http://localhost:5001"},
		LogMsg{Level: "WARN", Tag: "PKT", Message: "已发现加密流量（累计 1，已忽略）"},
		StatusMsg{HTTPRunning: true, WSRunning: true, CaptureRunning: true},
	}
	var packets uint64
	for i := 1; i <= sparklineHistory; i++ {
		packets += uint64(i * 100)
		messages = append(messages, StatsMsg{
			Packets:       packets,
			Errors:        2,
			WsClients:     1,
			MemoryMB:      float64(40 + i),
			MemorySysMB:   float64(80 + i),
			WsBatches:     uint64(i),
			WsMessages:    uint64(i * 4),
			WsQueueSize:   3,
			BytesReceived: uint64(i * 2048),
			BytesSent:     uint64(i * 1024),
			LogEntries:    3,
			LogBatches:    1,
			LogBufferSize: 3,
		})
	}
	for _, msg := range messages {
		next, _ := dash.Update(msg)
		dash = next.(Dashboard)
	}
	dash.autoScroll = false
	return dash
}

func dashView(d Dashboard, tab ViewTab) string {
	d.currentTab = tab
	return d.View()
}

func assertLineWidths(t *testing.T, view string, width int) {
	t.Helper()
	for i, line := range strings.Split(stripANSI(view), "\n") {
		if got := lipgloss.Width(line); got > width {
			t.Errorf("line %d is %d cells, wider than %d: %q", i+1, got, width, line)
		}
	}
}

func assertSameValueColumn(t *testing.T, plain string, labels []string, minCol, maxCol int) {
	t.Helper()
	col := -1
	for _, label := range labels {
		found := false
		for _, line := range strings.Split(plain, "\n") {
			start := valueColumn(line, label)
			if start < minCol || start >= maxCol {
				continue
			}
			found = true
			if col < 0 {
				col = start
				continue
			}
			if start != col {
				t.Errorf("%q value starts at column %d, want %d\n%s", label, start, col, line)
			}
		}
		if !found {
			t.Errorf("label %q not found in columns [%d,%d)", label, minCol, maxCol)
		}
	}
}

func valueColumn(line, label string) int {
	rest := line
	offset := 0
	for {
		i := strings.Index(rest, label)
		if i < 0 {
			return -1
		}
		i += offset
		j := i + len(label)
		prevOK := i == 0 || line[i-1] == ' '
		nextOK := j >= len(line) || line[j] == ' ' || line[j] == ':'
		if prevOK && nextOK {
			for j < len(line) && line[j] == ' ' {
				j++
			}
			return lipgloss.Width(line[:j])
		}
		offset = i + len(label)
		if offset > len(line) {
			return -1
		}
		rest = line[offset:]
	}
}

func stripANSI(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for i := 0; i < len(s); i++ {
		if s[i] != 0x1b {
			b.WriteByte(s[i])
			continue
		}
		if i+1 < len(s) && s[i+1] == '[' {
			i += 2
			for i < len(s) {
				c := s[i]
				if c >= 0x40 && c <= 0x7e {
					break
				}
				i++
			}
			continue
		}
		if i+1 < len(s) && s[i+1] == ']' {
			i += 2
			for i < len(s) {
				if s[i] == 0x07 {
					break
				}
				if s[i] == 0x1b && i+1 < len(s) && s[i+1] == '\\' {
					i++
					break
				}
				i++
			}
		}
	}
	return b.String()
}
