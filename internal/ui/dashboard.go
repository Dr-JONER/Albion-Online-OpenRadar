package ui

import (
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/textinput"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

const (
	headerHeight        = 5
	footerHeight        = 5
	maxLogs             = 1000
	sparklineHistory    = 60 // 60s of data
	sparklineDisplayLen = 42 // Display width (30% smaller)
)

// View tabs
type ViewTab int

const (
	TabLogs ViewTab = iota
	TabStats
	TabConfig
)

// Log levels for filtering
type LogLevel int

const (
	LevelAll LogLevel = iota
	LevelInfo
	LevelSuccess
	LevelWarn
	LevelError
)

// Message types
type LogMsg struct {
	Level   string
	Tag     string
	Message string
}

type StatsMsg struct {
	Packets       uint64
	Errors        uint64
	WsClients     int
	MemoryMB      float64
	MemorySysMB   float64
	Goroutines    int
	WsBatches     uint64
	WsMessages    uint64
	WsQueueSize   int
	BytesReceived uint64
	BytesSent     uint64
	LogEntries    uint64
	LogBatches    uint64
	LogBufferSize int
}

type StatusMsg struct {
	HTTPRunning    bool
	WSRunning      bool
	CaptureRunning bool
}

// CaptureSummary mirrors internal/capture.CaptureSummary so internal/ui has no
// dependency on internal/capture.
type CaptureSummary struct {
	Description string
	Address     string
	Category    string
}

type CaptureStateMsg struct {
	Active       []CaptureSummary
	LanAddresses []string
	Status       string
}

type RestartMsg struct{}

type TickMsg time.Time

// LogEntry stores a log with its metadata
type LogEntry struct {
	Time     time.Time
	Level    string
	Tag      string
	Message  string
	Rendered string
}

// Dashboard is the main Bubble Tea model
type Dashboard struct {
	ready            bool
	quitting         bool
	restartRequested bool

	// Static info
	version      string
	serverURL    string
	wsURL        string
	lanServerURL string
	lanWsURL     string
	mode         string
	port         int

	// Capture interfaces and LAN addresses (sourced from Manager.State() poll)
	captureInterfaces []CaptureSummary
	lanAddresses      []string
	captureStatus     string

	// Status indicators
	httpRunning    bool
	wsRunning      bool
	captureRunning bool

	// Real-time stats
	packets     uint64
	errors      uint64
	wsClients   int
	memoryMB    float64
	memorySysMB float64
	goroutines  int
	startTime   time.Time

	// WebSocket batching stats
	wsBatches   uint64
	wsMessages  uint64
	wsQueueSize int

	// Traffic stats
	bytesReceived     uint64
	bytesSent         uint64
	lastBytesReceived uint64
	lastBytesSent     uint64
	rxPerSec          uint64
	txPerSec          uint64

	// Log stats
	logEntries    uint64
	logBatches    uint64
	logBufferSize int

	// Sparkline history
	packetsHistory   []uint64
	memoryHistory    []float64
	memorySysHistory []float64
	wsBatchHistory   []uint64
	lastPackets      uint64
	lastWsBatches    uint64

	// Components
	viewport    viewport.Model
	searchInput textinput.Model
	logs        []LogEntry

	// UI State
	currentTab  ViewTab
	logFilter   LogLevel
	autoScroll  bool
	searching   bool
	searchQuery string

	// Dimensions
	width  int
	height int
}

// NewDashboard creates a new dashboard model
func NewDashboard(version string, port int, devMode bool, lanAddresses []string, captures []CaptureSummary) Dashboard {
	mode := "生产"
	if devMode {
		mode = "开发"
	}

	ti := textinput.New()
	ti.Placeholder = "搜索日志..."
	ti.CharLimit = 50

	d := Dashboard{
		version:           version,
		serverURL:         fmt.Sprintf("http://localhost:%d", port),
		wsURL:             fmt.Sprintf("ws://localhost:%d/ws", port),
		mode:              mode,
		port:              port,
		startTime:         time.Now(),
		logs:              make([]LogEntry, 0, maxLogs),
		packetsHistory:    make([]uint64, 0, sparklineHistory),
		memoryHistory:     make([]float64, 0, sparklineHistory),
		memorySysHistory:  make([]float64, 0, sparklineHistory),
		wsBatchHistory:    make([]uint64, 0, sparklineHistory),
		autoScroll:        true,
		currentTab:        TabLogs,
		logFilter:         LevelAll,
		searchInput:       ti,
		captureInterfaces: captures,
		lanAddresses:      lanAddresses,
	}
	if len(lanAddresses) > 0 && lanAddresses[0] != "127.0.0.1" {
		d.lanServerURL = fmt.Sprintf("http://%s:%d", lanAddresses[0], port)
		d.lanWsURL = fmt.Sprintf("ws://%s:%d/ws", lanAddresses[0], port)
	}
	return d
}

// RestartRequested returns true if user requested a restart
func (d Dashboard) RestartRequested() bool {
	return d.restartRequested
}

// Init initializes the dashboard
func (d Dashboard) Init() tea.Cmd {
	return tea.Batch(tickCmd(), tea.EnterAltScreen)
}

func tickCmd() tea.Cmd {
	return tea.Tick(time.Second, func(t time.Time) tea.Msg {
		return TickMsg(t)
	})
}

// Update handles messages
func (d Dashboard) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var (
		cmd  tea.Cmd
		cmds []tea.Cmd
	)

	// Handle search input mode
	if d.searching {
		switch msg := msg.(type) {
		case tea.KeyMsg:
			switch msg.String() {
			case "enter":
				d.searchQuery = d.searchInput.Value()
				d.searching = false
				d.viewport.SetContent(d.renderLogs())
			case "esc":
				d.searching = false
				d.searchInput.SetValue("")
				d.searchQuery = ""
				d.viewport.SetContent(d.renderLogs())
			default:
				d.searchInput, cmd = d.searchInput.Update(msg)
				cmds = append(cmds, cmd)
			}
		}
		return d, tea.Batch(cmds...)
	}

	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "q", "ctrl+c":
			d.quitting = true
			return d, tea.Quit
		case "r":
			d.restartRequested = true
			d.quitting = true
			return d, tea.Quit
		case "g":
			d.viewport.GotoTop()
			return d, nil
		case "G":
			d.viewport.GotoBottom()
			return d, nil
		case "p":
			d.autoScroll = !d.autoScroll
			return d, nil
		case "c":
			d.logs = make([]LogEntry, 0, maxLogs)
			d.viewport.SetContent(d.renderLogs())
			return d, nil
		case "f":
			d.logFilter = (d.logFilter + 1) % 5
			d.viewport.SetContent(d.renderLogs())
			return d, nil
		case "/":
			d.searching = true
			d.searchInput.Focus()
			return d, textinput.Blink
		case "1":
			d.currentTab = TabLogs
			return d, nil
		case "2":
			d.currentTab = TabStats
			return d, nil
		case "3":
			d.currentTab = TabConfig
			return d, nil
		case "tab":
			d.currentTab = (d.currentTab + 1) % 3
			return d, nil
		}

	case tea.WindowSizeMsg:
		d.width = msg.Width
		d.height = msg.Height

		viewportHeight := d.height - headerHeight - footerHeight - 2
		if !d.ready {
			d.viewport = viewport.New(d.width-2, viewportHeight)
			d.viewport.SetContent(d.renderLogs())
			d.ready = true
		} else {
			d.viewport.Width = d.width - 2
			d.viewport.Height = viewportHeight
		}

	case LogMsg:
		d.addLog(msg)
		if !d.ready {
			// unsized viewport → bubbles/viewport slice-bounds panic
			return d, nil
		}
		d.viewport.SetContent(d.renderLogs())
		if d.autoScroll {
			d.viewport.GotoBottom()
		}

	case StatsMsg:
		// Update sparkline histories
		packetsDiff := msg.Packets - d.lastPackets
		d.lastPackets = msg.Packets
		d.packetsHistory = append(d.packetsHistory, packetsDiff)
		if len(d.packetsHistory) > sparklineHistory {
			d.packetsHistory = d.packetsHistory[1:]
		}

		d.memoryHistory = append(d.memoryHistory, msg.MemoryMB)
		if len(d.memoryHistory) > sparklineHistory {
			d.memoryHistory = d.memoryHistory[1:]
		}

		d.memorySysHistory = append(d.memorySysHistory, msg.MemorySysMB)
		if len(d.memorySysHistory) > sparklineHistory {
			d.memorySysHistory = d.memorySysHistory[1:]
		}

		batchDiff := msg.WsBatches - d.lastWsBatches
		d.lastWsBatches = msg.WsBatches
		d.wsBatchHistory = append(d.wsBatchHistory, batchDiff)
		if len(d.wsBatchHistory) > sparklineHistory {
			d.wsBatchHistory = d.wsBatchHistory[1:]
		}

		d.packets = msg.Packets
		d.errors = msg.Errors
		d.wsClients = msg.WsClients
		d.memoryMB = msg.MemoryMB
		d.memorySysMB = msg.MemorySysMB
		d.goroutines = msg.Goroutines
		d.wsBatches = msg.WsBatches
		d.wsMessages = msg.WsMessages
		d.wsQueueSize = msg.WsQueueSize

		// Traffic stats (per second)
		d.rxPerSec = msg.BytesReceived - d.lastBytesReceived
		d.txPerSec = msg.BytesSent - d.lastBytesSent
		d.lastBytesReceived = msg.BytesReceived
		d.lastBytesSent = msg.BytesSent
		d.bytesReceived = msg.BytesReceived
		d.bytesSent = msg.BytesSent
		d.logEntries = msg.LogEntries
		d.logBatches = msg.LogBatches
		d.logBufferSize = msg.LogBufferSize

	case StatusMsg:
		d.httpRunning = msg.HTTPRunning
		d.wsRunning = msg.WSRunning
		d.captureRunning = msg.CaptureRunning

	case CaptureStateMsg:
		d.captureInterfaces = msg.Active
		d.lanAddresses = msg.LanAddresses
		d.captureStatus = msg.Status
		if len(msg.LanAddresses) > 0 && msg.LanAddresses[0] != "127.0.0.1" {
			d.lanServerURL = fmt.Sprintf("http://%s:%d", msg.LanAddresses[0], d.port)
			d.lanWsURL = fmt.Sprintf("ws://%s:%d/ws", msg.LanAddresses[0], d.port)
		} else {
			d.lanServerURL = ""
			d.lanWsURL = ""
		}

	case TickMsg:
		cmds = append(cmds, tickCmd())
	}

	// Only pass non-key messages to viewport (scroll is handled by arrow keys internally)
	if _, isKey := msg.(tea.KeyMsg); !isKey {
		d.viewport, cmd = d.viewport.Update(msg)
		cmds = append(cmds, cmd)
	} else {
		// Pass only arrow keys to viewport for scrolling
		if key, ok := msg.(tea.KeyMsg); ok {
			switch key.String() {
			case "up", "down", "pgup", "pgdown":
				d.viewport, cmd = d.viewport.Update(msg)
				cmds = append(cmds, cmd)
			}
		}
	}

	return d, tea.Batch(cmds...)
}

func (d *Dashboard) addLog(log LogMsg) {
	entry := LogEntry{
		Time:    time.Now(),
		Level:   log.Level,
		Tag:     log.Tag,
		Message: log.Message,
	}

	// Pre-render the log line
	ts := TimestampStyle.Render(fmt.Sprintf("[%s]", entry.Time.Format(time.TimeOnly)))
	tag := GetTagStyle(log.Level).Render(fmt.Sprintf("[%s]", log.Tag))
	entry.Rendered = fmt.Sprintf("%s %s %s", ts, tag, log.Message)

	d.logs = append(d.logs, entry)

	if len(d.logs) > maxLogs {
		d.logs = d.logs[len(d.logs)-maxLogs:]
	}
}

func (d *Dashboard) filterLogs() []LogEntry {
	if d.logFilter == LevelAll && d.searchQuery == "" {
		return d.logs
	}

	filtered := make([]LogEntry, 0)
	for _, log := range d.logs {
		// Filter by level
		if d.logFilter != LevelAll {
			switch d.logFilter {
			case LevelInfo:
				if log.Level != "INFO" {
					continue
				}
			case LevelSuccess:
				if log.Level != "SUCCESS" {
					continue
				}
			case LevelWarn:
				if log.Level != "WARN" {
					continue
				}
			case LevelError:
				if log.Level != "ERROR" {
					continue
				}
			}
		}

		// Filter by search query
		if d.searchQuery != "" {
			if !strings.Contains(strings.ToLower(log.Message), strings.ToLower(d.searchQuery)) &&
				!strings.Contains(strings.ToLower(log.Tag), strings.ToLower(d.searchQuery)) {
				continue
			}
		}

		filtered = append(filtered, log)
	}
	return filtered
}

func (d *Dashboard) renderLogs() string {
	logs := d.filterLogs()
	if len(logs) == 0 {
		if d.searchQuery != "" {
			return TimestampStyle.Render(fmt.Sprintf("  没有匹配“%s”的日志", d.searchQuery))
		}
		return TimestampStyle.Render("  等待日志...")
	}

	lines := make([]string, len(logs))
	for i, log := range logs {
		lines[i] = log.Rendered
	}
	return strings.Join(lines, "\n")
}

// View renders the dashboard
func (d Dashboard) View() string {
	if d.quitting {
		return ""
	}

	if !d.ready {
		return "正在初始化..."
	}

	header := d.renderHeader()

	var content string
	switch d.currentTab {
	case TabLogs:
		content = BorderStyle.Width(d.width - 2).Render(d.viewport.View())
	case TabStats:
		content = BorderStyle.Width(d.width - 2).Render(d.renderStatsView())
	case TabConfig:
		content = BorderStyle.Width(d.width - 2).Render(d.renderConfigView())
	}

	footer := d.renderFooter()

	return lipgloss.JoinVertical(lipgloss.Left, header, content, footer)
}

func (d *Dashboard) renderHeader() string {
	// Title and status indicators
	title := TitleStyle.Render("OpenRadar v" + d.version)

	httpStatus := statusIndicator(d.httpRunning, "HTTP")
	wsStatus := statusIndicator(d.wsRunning, "WS")
	captureStatus := statusIndicator(d.captureRunning, "抓包")
	status := fmt.Sprintf("%s %s %s", httpStatus, wsStatus, captureStatus)

	// Mode and capture interfaces
	mode := ModeStyle.Render("模式: " + d.mode)
	captureLine := "抓包: " + formatCaptureLine(d.captureInterfaces)
	adapter := TimestampStyle.Render(captureLine)

	httpLine := d.serverURL
	wsLine := d.wsURL
	if d.lanServerURL != "" {
		httpLine = httpLine + "  |  " + d.lanServerURL + " (局域网)"
		wsLine = wsLine + "  |  " + d.lanWsURL
	}
	httpURL := URLStyle.Render(httpLine)
	wsURL := URLStyle.Render(wsLine)

	// Started time
	startedAt := TimestampStyle.Render("启动: " + d.startTime.Format(time.TimeOnly))

	// Tabs
	tabs := d.renderTabs()

	left := lipgloss.JoinVertical(lipgloss.Left, title, mode, adapter, startedAt)
	right := lipgloss.JoinVertical(lipgloss.Right, status, httpURL, wsURL, "")

	leftWidth := lipgloss.Width(left)
	rightWidth := lipgloss.Width(right)
	spacing := max(d.width-leftWidth-rightWidth-4, 1)

	row := lipgloss.JoinHorizontal(lipgloss.Top, left, strings.Repeat(" ", spacing), right)
	headerContent := lipgloss.JoinVertical(lipgloss.Left, row, tabs)

	return HeaderStyle.Width(d.width).Render(headerContent)
}

func (d *Dashboard) renderTabs() string {
	tabs := []string{"[1] 日志", "[2] 统计", "[3] 配置"}
	rendered := make([]string, len(tabs))

	for i, tab := range tabs {
		if ViewTab(i) == d.currentTab {
			rendered[i] = TabActiveStyle.Render(tab)
		} else {
			rendered[i] = TabStyle.Render(tab)
		}
	}

	return strings.Join(rendered, "  ")
}

func statusIndicator(running bool, label string) string {
	if running {
		return StatusOnStyle.Render("●") + " " + StatLabelStyle.Render(label)
	}
	return StatusOffStyle.Render("●") + " " + StatLabelStyle.Render(label)
}

func (d *Dashboard) renderFooter() string {
	uptime := time.Since(d.startTime).Round(time.Second)

	// Stats line 1: Packets & Memory. The sparkline shrinks so this row
	// stays inside the footer once the Chinese labels are measured.
	packetsText := formatNumber(d.packets)
	heapText := fmt.Sprintf("%.0fMB", d.memoryMB)
	sysText := fmt.Sprintf("%.0fMB", d.memorySysMB)
	upText := formatDuration(uptime)
	var packetsSparkline string
	sparkReserve := fmt.Sprintf(
		"%s %s %s  |  %s %s  %s %s  |  %s %s",
		"包:", packetsText, "",
		"堆:", heapText,
		"系统:", sysText,
		"运行:", upText,
	)
	packetsSparkline = renderSparkline(d.packetsHistory, ColorPrimary, d.footerSparkCells(sparkReserve))
	stats1 := fmt.Sprintf(
		"%s %s %s  |  %s %s  %s %s  |  %s %s",
		StatLabelStyle.Render("包:"),
		StatValueStyle.Render(packetsText),
		packetsSparkline,
		StatLabelStyle.Render("堆:"),
		StatValueStyle.Render(heapText),
		StatLabelStyle.Render("系统:"),
		StatValueStyle.Render(sysText),
		StatLabelStyle.Render("运行:"),
		StatValueStyle.Render(upText),
	)

	// Stats line 2: WS batching & system
	stats2 := fmt.Sprintf(
		"%s %s  |  %s %s  |  %s %s  |  %s %s",
		StatLabelStyle.Render("批次:"),
		StatValueStyle.Render(fmt.Sprintf("%s/%s", formatNumber(d.wsBatches), formatNumber(d.wsMessages))),
		StatLabelStyle.Render("WS:"),
		StatValueStyle.Render(strconv.Itoa(d.wsClients)),
		StatLabelStyle.Render("错误:"),
		StatValueStyle.Render(formatNumber(d.errors)),
		StatLabelStyle.Render("日志:"),
		StatValueStyle.Render(strconv.Itoa(len(d.logs))),
	)

	// Filter and scroll status
	filterStr := d.getFilterString()
	scrollStr := ""
	if !d.autoScroll {
		scrollStr = " | " + ModeStyle.Render("已暂停")
	}
	if d.searchQuery != "" {
		scrollStr += " | " + URLStyle.Render("搜索: "+d.searchQuery)
	}
	statusLine := filterStr + scrollStr

	// Help
	help := HelpStyle.Render(
		"q:退出  r:重启  p:暂停  c:清空  f:筛选  /:搜索  tab:切换  ↑↓:滚动",
	)

	// Search input if active
	if d.searching {
		searchBox := d.searchInput.View()
		return FooterStyle.Width(d.width).Align(lipgloss.Center).Render(
			lipgloss.JoinVertical(lipgloss.Center, stats1, stats2, searchBox, help),
		)
	}

	return FooterStyle.Width(d.width).Align(lipgloss.Center).Render(
		lipgloss.JoinVertical(lipgloss.Center, stats1, stats2, statusLine, help),
	)
}

func (d *Dashboard) getFilterString() string {
	switch d.logFilter {
	case LevelInfo:
		return LogInfoStyle.Render("筛选: INFO")
	case LevelSuccess:
		return LogSuccessStyle.Render("筛选: SUCCESS")
	case LevelWarn:
		return LogWarnStyle.Render("筛选: WARN")
	case LevelError:
		return LogErrorStyle.Render("筛选: ERROR")
	default:
		return StatLabelStyle.Render("筛选: ALL")
	}
}

func (d *Dashboard) renderStatsView() string {
	uptime := time.Since(d.startTime).Round(time.Second)

	// Calculate derived metrics
	avgMsgsPerBatch := float64(0)
	if d.wsBatches > 0 {
		avgMsgsPerBatch = float64(d.wsMessages) / float64(d.wsBatches)
	}
	errorRate := float64(0)
	if d.packets > 0 {
		errorRate = float64(d.errors) / float64(d.packets) * 100
	}
	packetsPerSec := float64(0)
	if len(d.packetsHistory) > 0 {
		packetsPerSec = float64(d.packetsHistory[len(d.packetsHistory)-1])
	}
	batchesPerSec := float64(0)
	if len(d.wsBatchHistory) > 0 {
		batchesPerSec = float64(d.wsBatchHistory[len(d.wsBatchHistory)-1])
	}

	colWidth := max((d.width-4)/2, 1)
	// Leave one cell for the leading space in front of each sparkline.
	sparkBudget := min(sparklineDisplayLen, max(colWidth-1, 0))

	// Label column tracks the widest label in display cells, not bytes.
	statLabels := []string{
		"运行时间:", "数据包:", "包/秒:", "错误:", "错误率:",
		"客户端:", "批次:", "批次/秒:", "消息:", "每批平均:", "队列:",
		"接收总量:", "接收/秒:", "发送总量:", "发送/秒:",
		"条目:", "缓冲区:",
	}
	labelStyle := fitStyle(StatLabelStyle, lipgloss.Right, statLabels)
	valStyle := func(color lipgloss.Color) lipgloss.Style {
		return lipgloss.NewStyle().Bold(true).Foreground(color)
	}
	stat := func(label, value string, color lipgloss.Color) string {
		return fmt.Sprintf(" %s %s", labelStyle.Render(label), valStyle(color).Render(value))
	}
	section := func(icon, title string) string {
		return fmt.Sprintf(" %s %s", icon, TitleStyle.Render(title))
	}

	// Left column: Server, WebSocket, Traffic
	leftLines := []string{
		section("📊", "服务器"),
		stat("运行时间:", formatDuration(uptime), ColorHighlight),
		stat("数据包:", formatNumber(d.packets), ColorSuccess),
		stat("包/秒:", fmt.Sprintf("%.0f", packetsPerSec), ColorPrimary),
		stat("错误:", formatNumber(d.errors), d.getErrorColor(errorRate)),
		stat("错误率:", fmt.Sprintf("%.2f%%", errorRate), d.getErrorColor(errorRate)),
		"",
		section("🔌", "WebSocket"),
		stat("客户端:", strconv.Itoa(d.wsClients), ColorPrimary),
		stat("批次:", formatNumber(d.wsBatches), ColorSuccess),
		stat("批次/秒:", fmt.Sprintf("%.0f", batchesPerSec), ColorPrimary),
		stat("消息:", formatNumber(d.wsMessages), ColorSuccess),
		stat("每批平均:", fmt.Sprintf("%.1f", avgMsgsPerBatch), ColorWarning),
		stat("队列:", strconv.Itoa(d.wsQueueSize), d.getQueueColor()),
		"",
		section("📡", "流量"),
		stat("接收总量:", formatBytes(d.bytesReceived), ColorPrimary),
		stat("接收/秒:", formatBytes(d.rxPerSec)+"/s", ColorSuccess),
		stat("发送总量:", formatBytes(d.bytesSent), ColorPrimary),
		stat("发送/秒:", formatBytes(d.txPerSec)+"/s", ColorWarning),
	}

	// Right column: Sparklines + Logging
	rightLines := []string{
		section("📈", "包/秒"),
		" " + renderSparkline(d.packetsHistory, ColorPrimary, sparkBudget),
		" " + d.getSparklineStats(d.packetsHistory, ""),
		"",
		section("🧠", "堆内存 MB"),
		" " + renderSparkline(d.memoryHistory, ColorWarning, sparkBudget),
		" " + d.getSparklineStatsFloat(d.memoryHistory, ""),
		"",
		section("💾", "系统内存 MB"),
		" " + renderSparkline(d.memorySysHistory, ColorError, sparkBudget),
		" " + d.getSparklineStatsFloat(d.memorySysHistory, ""),
		"",
		section("📝", "日志"),
		stat("条目:", formatNumber(d.logEntries), ColorSuccess),
		stat("批次:", formatNumber(d.logBatches), ColorPrimary),
		stat("缓冲区:", strconv.Itoa(d.logBufferSize), ColorWarning),
	}

	leftCol := lipgloss.NewStyle().Width(colWidth).Render(strings.Join(leftLines, "\n"))
	rightCol := lipgloss.NewStyle().Width(colWidth).Render(strings.Join(rightLines, "\n"))

	return lipgloss.JoinHorizontal(lipgloss.Top, " ", leftCol, " ", rightCol)
}

func (d *Dashboard) getErrorColor(rate float64) lipgloss.Color {
	if rate > 5 {
		return ColorError
	} else if rate > 1 {
		return ColorWarning
	}
	return ColorSuccess
}

func (d *Dashboard) getQueueColor() lipgloss.Color {
	if d.wsQueueSize > 50 {
		return ColorError
	} else if d.wsQueueSize > 20 {
		return ColorWarning
	}
	return ColorSuccess
}

func (d *Dashboard) getSparklineStats(data []uint64, unit string) string {
	if len(data) == 0 {
		return StatLabelStyle.Render("无数据")
	}
	lo, hi, avg := float64(slices.Min(data)), float64(slices.Max(data)), avgVal(data)
	return StatLabelStyle.Render(fmt.Sprintf("最小: %.0f  平均: %.0f  最大: %.0f %s", lo, avg, hi, unit))
}

func (d *Dashboard) getSparklineStatsFloat(data []float64, unit string) string {
	if len(data) == 0 {
		return StatLabelStyle.Render("无数据")
	}
	lo, hi, avg := float64(slices.Min(data)), float64(slices.Max(data)), avgVal(data)
	return StatLabelStyle.Render(fmt.Sprintf("最小: %.1f  平均: %.1f  最大: %.1f %s", lo, avg, hi, unit))
}

func (d *Dashboard) renderConfigView() string {
	section := func(icon, title string) string {
		return fmt.Sprintf(" %s %s", icon, TitleStyle.Render(title))
	}
	cfgLabels := []string{"版本:", "模式:", "HTTP 地址:", "WS 地址:", "抓包:", "局域网:"}
	labelStyle := fitStyle(StatLabelStyle, lipgloss.Right, cfgLabels)
	cfgLine := func(label, value string, style lipgloss.Style) string {
		return fmt.Sprintf(" %s %s", labelStyle.Render(label), style.Render(value))
	}
	keys := []string{"q", "r", "p", "c", "f", "/", "↑↓", "g/G", "1-3", "tab"}
	keyStyle := fitStyle(lipgloss.NewStyle().Bold(true).Foreground(ColorPrimary), lipgloss.Left, keys)
	keyLine := func(key, desc string) string {
		return fmt.Sprintf(" %s %s", keyStyle.Render(key), StatLabelStyle.Render(desc))
	}

	// Left column: Configuration
	leftLines := []string{
		section("⚙️", "配置"),
		cfgLine("版本:", d.version, StatValueStyle),
		cfgLine("模式:", d.mode, ModeStyle),
		cfgLine("HTTP 地址:", d.serverURL, URLStyle),
		cfgLine("WS 地址:", d.wsURL, URLStyle),
		cfgLine("抓包:", formatCaptureLine(d.captureInterfaces), StatValueStyle),
		cfgLine("局域网:", strings.Join(d.lanAddresses, ", "), StatValueStyle),
		"",
		section("ℹ️", "关于"),
		cfgLine("", "OpenRadar - Albion Online", StatLabelStyle),
		cfgLine("", "实时数据包雷达", StatLabelStyle),
	}

	// Right column: Keyboard shortcuts (single column for alignment)
	rightLines := []string{
		section("⌨️", "快捷键"),
		keyLine("q", "退出程序"),
		keyLine("r", "重启程序"),
		keyLine("p", "切换自动滚动"),
		keyLine("c", "清空日志"),
		keyLine("f", "切换日志筛选"),
		keyLine("/", "搜索日志"),
		keyLine("↑↓", "滚动日志"),
		keyLine("g/G", "跳到顶部/底部"),
		keyLine("1-3", "切换标签页"),
		keyLine("tab", "下一个标签页"),
		"",
		section("📋", "日志级别"),
		" " + LogInfoStyle.Render("INFO") + " " + LogSuccessStyle.Render("SUCCESS") + " " + LogWarnStyle.Render("WARN") + " " + LogErrorStyle.Render("ERROR"),
	}

	colWidth := (d.width - 4) / 2
	leftCol := lipgloss.NewStyle().Width(colWidth).Render(strings.Join(leftLines, "\n"))
	rightCol := lipgloss.NewStyle().Width(colWidth).Render(strings.Join(rightLines, "\n"))

	return lipgloss.JoinHorizontal(lipgloss.Top, " ", leftCol, " ", rightCol)
}

// fitStyle pads every item to the widest display width. len() would under-count
// Chinese characters and shift the value column.
func fitStyle(base lipgloss.Style, align lipgloss.Position, items []string) lipgloss.Style {
	w := 0
	for _, item := range items {
		if lw := lipgloss.Width(item); lw > w {
			w = lw
		}
	}
	return base.Width(w).Align(align)
}

// footerSparkCells is how many cells the packet sparkline may occupy without
// pushing the footer stats past the terminal width.
func (d *Dashboard) footerSparkCells(reservePlain string) int {
	avail := d.width - FooterStyle.GetHorizontalFrameSize() - lipgloss.Width(reservePlain)
	if avail > sparklineDisplayLen {
		avail = sparklineDisplayLen
	}
	if avail < 0 {
		return 0
	}
	return avail
}

// Sparkline rendering
var sparkChars = []rune{'▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'}

func renderSparkline[T uint64 | float64](data []T, color lipgloss.Color, maxCells int) string {
	if len(data) == 0 || maxCells <= 0 {
		return ""
	}

	// Block glyphs are usually one cell, but measure them so a double-width
	// font cannot push the line past the column.
	cell := lipgloss.Width(string(sparkChars[0]))
	if cell < 1 {
		cell = 1
	}
	maxRunes := maxCells / cell
	if maxRunes < 1 {
		return ""
	}

	displayData := data
	if len(data) > maxRunes {
		displayData = make([]T, maxRunes)
		ratio := float64(len(data)) / float64(maxRunes)
		for i := range maxRunes {
			// Average the values in each bucket
			start := int(float64(i) * ratio)
			end := min(int(float64(i+1)*ratio), len(data))
			var sum float64
			for j := start; j < end; j++ {
				sum += float64(data[j])
			}
			displayData[i] = T(sum / float64(end-start))
		}
	}

	peak := slices.Max(displayData)
	if peak == 0 {
		return lipgloss.NewStyle().
			Foreground(color).
			Render(strings.Repeat(string(sparkChars[0]), len(displayData)))
	}

	var sb strings.Builder
	for _, v := range displayData {
		idx := min(int(float64(v)/float64(peak)*float64(len(sparkChars)-1)), len(sparkChars)-1)
		sb.WriteRune(sparkChars[idx])
	}

	return lipgloss.NewStyle().Foreground(color).Render(sb.String())
}

func avgVal[T uint64 | float64](data []T) float64 {
	if len(data) == 0 {
		return 0
	}
	var sum float64
	for _, v := range data {
		sum += float64(v)
	}
	return sum / float64(len(data))
}

func formatNumber(n uint64) string {
	str := strconv.FormatUint(n, 10)
	if len(str) <= 3 {
		return str
	}

	var result strings.Builder
	for i, c := range str {
		if i > 0 && (len(str)-i)%3 == 0 {
			result.WriteRune(',')
		}
		result.WriteRune(c)
	}
	return result.String()
}

func formatBytes(b uint64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := uint64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(b)/float64(div), "KMGTPE"[exp])
}

func formatCaptureLine(summaries []CaptureSummary) string {
	if len(summaries) == 0 {
		return "(等待中)"
	}
	parts := make([]string, 0, len(summaries))
	for _, c := range summaries {
		parts = append(parts, fmt.Sprintf("%s (%s)", c.Description, c.Address))
	}
	return strings.Join(parts, ", ")
}

func formatDuration(d time.Duration) string {
	d = d.Round(time.Second)

	h := d / time.Hour
	d -= h * time.Hour
	m := d / time.Minute
	d -= m * time.Minute
	s := d / time.Second

	if h > 0 {
		return fmt.Sprintf("%dh%dm", h, m)
	}
	if m > 0 {
		return fmt.Sprintf("%dm%ds", m, s)
	}
	return fmt.Sprintf("%ds", s)
}
