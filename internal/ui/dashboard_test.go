package ui

import (
	"slices"
	"strings"
	"testing"
)

func TestCaptureStateMsgUpdatesFields(t *testing.T) {
	d := NewDashboard("v0", 5001, true, nil, nil)
	msg := CaptureStateMsg{
		Active: []CaptureSummary{
			{Description: "Wi-Fi", Address: "192.168.1.42", Category: "wifi"},
			{Description: "Realtek", Address: "192.168.1.10", Category: "ethernet"},
		},
		LanAddresses: []string{"192.168.1.42", "192.168.1.10"},
		Status:       "running",
	}
	updated, _ := d.Update(msg)
	out, ok := updated.(Dashboard)
	if !ok {
		t.Fatal("Update did not return Dashboard")
	}
	if len(out.captureInterfaces) != 2 {
		t.Errorf("captureInterfaces len=%d, want 2", len(out.captureInterfaces))
	}
	if out.captureStatus != "running" {
		t.Errorf("status=%q, want running", out.captureStatus)
	}
	if out.lanServerURL == "" {
		t.Error("lanServerURL not derived from first LAN address")
	}
}

func TestCaptureStateMsgClearsLANUrlsWhenEmpty(t *testing.T) {
	d := NewDashboard("v0", 5001, true, []string{"192.168.1.42"}, nil)
	if d.lanServerURL == "" {
		t.Fatal("expected non-empty lanServerURL after init with LAN address")
	}
	msg := CaptureStateMsg{
		Active:       []CaptureSummary{},
		LanAddresses: nil,
		Status:       "awaiting_interfaces",
	}
	updated, _ := d.Update(msg)
	out, ok := updated.(Dashboard)
	if !ok {
		t.Fatal("Update did not return Dashboard")
	}
	if out.lanServerURL != "" {
		t.Errorf("lanServerURL should be cleared, got %q", out.lanServerURL)
	}
	if out.lanWsURL != "" {
		t.Errorf("lanWsURL should be cleared, got %q", out.lanWsURL)
	}
	if out.captureStatus != "awaiting_interfaces" {
		t.Errorf("status=%q, want awaiting_interfaces", out.captureStatus)
	}
}

func TestFormatCaptureLine(t *testing.T) {
	cases := []struct {
		name string
		in   []CaptureSummary
		want string
	}{
		{"nil", nil, "(等待中)"},
		{"empty slice", []CaptureSummary{}, "(等待中)"},
		{"one", []CaptureSummary{{Description: "Wi-Fi", Address: "10.0.0.1"}}, "Wi-Fi (10.0.0.1)"},
		{"two", []CaptureSummary{
			{Description: "Wi-Fi", Address: "10.0.0.1"},
			{Description: "Ethernet", Address: "10.0.0.2"},
		}, "Wi-Fi (10.0.0.1), Ethernet (10.0.0.2)"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := formatCaptureLine(tc.in); got != tc.want {
				t.Errorf("formatCaptureLine(%v) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func sparkRunes(s string) []rune {
	var out []rune
	for _, r := range s {
		if slices.Contains(sparkChars, r) {
			out = append(out, r)
		}
	}
	return out
}

func TestRenderSparkline(t *testing.T) {
	if got := renderSparkline([]uint64{}, ColorPrimary, sparklineDisplayLen); got != "" {
		t.Errorf("empty data rendered %q, want empty", got)
	}
	if got := sparkRunes(renderSparkline([]uint64{0, 0, 0}, ColorPrimary, sparklineDisplayLen)); string(got) != "▁▁▁" {
		t.Errorf("all zeros rendered %q, want ▁▁▁", string(got))
	}
	if got := sparkRunes(renderSparkline([]uint64{0, 4, 8}, ColorPrimary, sparklineDisplayLen)); string(got) != "▁▄█" {
		t.Errorf("0,4,8 rendered %q, want ▁▄█", string(got))
	}
	if got := sparkRunes(renderSparkline([]float64{2.5, 5}, ColorPrimary, sparklineDisplayLen)); string(got) != "▄█" {
		t.Errorf("2.5,5 rendered %q, want ▄█", string(got))
	}
	long := make([]uint64, sparklineHistory)
	for i := range long {
		long[i] = uint64(i)
	}
	if got := sparkRunes(renderSparkline(long, ColorPrimary, sparklineDisplayLen)); len(got) != sparklineDisplayLen {
		t.Errorf("%d points rendered %d chars, want %d", len(long), len(got), sparklineDisplayLen)
	}
	if got := sparkRunes(renderSparkline(long, ColorPrimary, 10)); len(got) != 10 {
		t.Errorf("width cap rendered %d chars, want 10", len(got))
	}
}

func TestSparklineStats(t *testing.T) {
	d := NewDashboard("v0", 5001, true, nil, nil)
	if got := d.getSparklineStats(nil, ""); !strings.Contains(got, "无数据") {
		t.Errorf("nil data = %q, want 无数据", got)
	}
	if got := d.getSparklineStats([]uint64{3, 1, 2}, "p/s"); !strings.Contains(got, "最小: 1  平均: 2  最大: 3 p/s") {
		t.Errorf("uint64 stats = %q", got)
	}
	if got := d.getSparklineStatsFloat([]float64{1.5, 0.5}, "MB"); !strings.Contains(got, "最小: 0.5  平均: 1.0  最大: 1.5 MB") {
		t.Errorf("float64 stats = %q", got)
	}
}

func TestLogFilterKeepsEnglishLevelWords(t *testing.T) {
	d := NewDashboard("v0", 5001, true, nil, nil)
	d.addLog(LogMsg{Level: "INFO", Tag: "APP", Message: "甲"})
	d.addLog(LogMsg{Level: "WARN", Tag: "NET", Message: "乙"})
	d.logFilter = LevelInfo
	logs := d.filterLogs()
	if len(logs) != 1 || logs[0].Message != "甲" {
		t.Fatalf("INFO filter = %+v, want only 甲", logs)
	}
	if got := d.getFilterString(); !strings.Contains(got, "筛选: INFO") {
		t.Errorf("filter label = %q, want 筛选: INFO", got)
	}
}
