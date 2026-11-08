# Registers a Windows scheduled task that runs Deal Scout every day.
# Usage (from the repo folder):
#   powershell -ExecutionPolicy Bypass -File .\scripts\install-schedule.ps1
#   powershell -ExecutionPolicy Bypass -File .\scripts\install-schedule.ps1 -Time "7:15AM"
# To remove it:
#   Unregister-ScheduledTask -TaskName "Deal Scout" -Confirm:$false

param(
    [string]$Time = "6:49AM"
)

$script = Join-Path $PSScriptRoot "run-scout.ps1"
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`""
$trigger = New-ScheduledTaskTrigger -Daily -At $Time

# StartWhenAvailable: if the PC was asleep or off at run time, run as soon as it's back.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1)

Register-ScheduledTask -TaskName "Deal Scout" -Action $action -Trigger $trigger `
    -Settings $settings -Description "Daily business-for-sale scout (Claude Code)" -Force

Write-Host "Deal Scout scheduled daily at $Time. Test it now with:"
Write-Host "  Start-ScheduledTask -TaskName 'Deal Scout'"
