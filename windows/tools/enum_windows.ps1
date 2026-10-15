$ErrorActionPreference = "SilentlyContinue"
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public class WinEnum2 {
    public delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder sb, int max);
    [DllImport("user32.dll")] public static extern int GetClassName(IntPtr h, StringBuilder sb, int max);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int l; public int t; public int r; public int b; }
    public static List<string> Find(uint[] pids) {
        List<string> res = new List<string>();
        EnumWindows(delegate(IntPtr h, IntPtr l) {
            uint pid; GetWindowThreadProcessId(h, out pid);
            for (int i = 0; i < pids.Length; i++) {
                if (pids[i] == pid) {
                    StringBuilder t = new StringBuilder(256); GetWindowText(h, t, 256);
                    StringBuilder c = new StringBuilder(256); GetClassName(h, c, 256);
                    RECT r; GetWindowRect(h, out r);
                    int ex = GetWindowLong(h, -20);
                    res.Add(String.Format("hwnd={0} pid={1} vis={2} icon={3} ex=0x{4:X8} class={5} rect=({6},{7},{8},{9}) title='{10}'",
                        h, pid, IsWindowVisible(h), IsIconic(h), ex, c, r.l, r.t, r.r, r.b, t));
                    break;
                }
            }
            return true;
        }, IntPtr.Zero);
        return res;
    }
}
"@
$pids = @(Get-Process Typora -ErrorAction SilentlyContinue | ForEach-Object { [uint32]$_.Id })
Write-Output ("typora pids: " + ($pids -join ","))
foreach ($s in [WinEnum2]::Find($pids)) { Write-Output ("  " + $s) }
Write-Output "=== Typora conf ==="
$conf = Join-Path $env:APPDATA "Typora\conf"
if (Test-Path $conf) {
    Get-ChildItem $conf -File | ForEach-Object {
        Write-Output ("-- " + $_.Name)
        Write-Output (Get-Content $_.FullName -Raw)
    }
} else { Write-Output "no conf dir" }