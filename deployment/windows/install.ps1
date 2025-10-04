# ArbitrageX MEV Engine - Windows Installation Script
# Version: 3.6.0
# Requirements: Windows 10/11 with PowerShell 5.1+
# Must be run as Administrator

#Requires -RunAsAdministrator
#Requires -Version 5.1

# Set strict mode for better error handling
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# Script configuration
$global:Config = @{
    AppName = "ArbitrageX MEV Engine"
    Version = "3.6.0"
    InstallPath = "$env:ProgramFiles\ArbitrageX"
    DataPath = "$env:ProgramData\ArbitrageX"
    LogPath = "$env:ProgramData\ArbitrageX\Logs"
    RepositoryUrl = "https://github.com/arbitragex/mev-engine.git"
    RequiredDiskSpace = 5GB
    RequiredMemory = 8GB
    DatabaseName = "arbitragex"
    DatabaseUser = "mevengine"
}

# Color configuration for output
$global:Colors = @{
    Success = "Green"
    Warning = "Yellow"
    Error = "Red"
    Info = "Cyan"
    Header = "Magenta"
}

# Function to write colored output
function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Type = "Info",
        [switch]$NoNewline
    )
    
    $color = $Colors[$Type]
    if ($NoNewline) {
        Write-Host $Message -ForegroundColor $color -NoNewline
    } else {
        Write-Host $Message -ForegroundColor $color
    }
}

# Function to show header
function Show-Header {
    Clear-Host
    Write-ColorOutput "`n╔═══════════════════════════════════════════════════════════════╗" -Type Header
    Write-ColorOutput "║               ArbitrageX MEV Engine Installer                  ║" -Type Header
    Write-ColorOutput "║                       Version $($Config.Version)                        ║" -Type Header
    Write-ColorOutput "╚═══════════════════════════════════════════════════════════════╝`n" -Type Header
}

# Function to check Windows version
function Test-WindowsVersion {
    Write-ColorOutput "Checking Windows version..." -Type Info
    
    $os = Get-WmiObject -Class Win32_OperatingSystem
    $version = [Version]$os.Version
    
    if ($version.Major -lt 10) {
        throw "Windows 10 or 11 is required. Current version: $($os.Caption)"
    }
    
    Write-ColorOutput "✓ Windows version check passed: $($os.Caption)" -Type Success
    return $true
}

# Function to check system requirements
function Test-SystemRequirements {
    Write-ColorOutput "`nChecking system requirements..." -Type Info
    
    # Check available memory
    $totalMemory = (Get-WmiObject -Class Win32_ComputerSystem).TotalPhysicalMemory
    if ($totalMemory -lt $Config.RequiredMemory) {
        throw "Insufficient memory. Required: $(Config.RequiredMemory / 1GB)GB, Available: $([math]::Round($totalMemory / 1GB, 2))GB"
    }
    Write-ColorOutput "✓ Memory check passed: $([math]::Round($totalMemory / 1GB, 2))GB available" -Type Success
    
    # Check disk space
    $drive = (Get-PSDrive -Name C).Free
    if ($drive -lt $Config.RequiredDiskSpace) {
        throw "Insufficient disk space. Required: $($Config.RequiredDiskSpace / 1GB)GB, Available: $([math]::Round($drive / 1GB, 2))GB"
    }
    Write-ColorOutput "✓ Disk space check passed: $([math]::Round($drive / 1GB, 2))GB available" -Type Success
    
    # Check PowerShell version
    if ($PSVersionTable.PSVersion.Major -lt 5) {
        throw "PowerShell 5.1 or higher is required"
    }
    Write-ColorOutput "✓ PowerShell version check passed: $($PSVersionTable.PSVersion)" -Type Success
    
    return $true
}

# Function to install Chocolatey
function Install-Chocolatey {
    Write-ColorOutput "`nInstalling Chocolatey package manager..." -Type Info
    
    if (Get-Command choco -ErrorAction SilentlyContinue) {
        Write-ColorOutput "✓ Chocolatey already installed" -Type Success
        return $true
    }
    
    try {
        Set-ExecutionPolicy Bypass -Scope Process -Force
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
        Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))
        
        # Refresh environment
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        
        Write-ColorOutput "✓ Chocolatey installed successfully" -Type Success
        return $true
    } catch {
        throw "Failed to install Chocolatey: $_"
    }
}

# Function to install prerequisites
function Install-Prerequisites {
    Write-ColorOutput "`nInstalling prerequisites..." -Type Info
    
    $packages = @(
        @{Name = "git"; DisplayName = "Git"},
        @{Name = "nodejs-lts"; DisplayName = "Node.js LTS"},
        @{Name = "python"; DisplayName = "Python 3"},
        @{Name = "postgresql14"; DisplayName = "PostgreSQL 14"},
        @{Name = "redis-64"; DisplayName = "Redis"},
        @{Name = "nssm"; DisplayName = "NSSM (Service Manager)"},
        @{Name = "curl"; DisplayName = "cURL"},
        @{Name = "wget"; DisplayName = "Wget"},
        @{Name = "jq"; DisplayName = "jq"}
    )
    
    foreach ($package in $packages) {
        Write-ColorOutput "Installing $($package.DisplayName)..." -Type Info -NoNewline
        
        try {
            $result = choco install $package.Name -y --no-progress 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-ColorOutput " ✓" -Type Success
            } else {
                Write-ColorOutput " ⚠ (May already be installed)" -Type Warning
            }
        } catch {
            Write-ColorOutput " ✗" -Type Error
            Write-ColorOutput "Error: $_" -Type Error
        }
    }
    
    # Install Rust separately (not available in Chocolatey)
    Write-ColorOutput "Installing Rust..." -Type Info
    if (-not (Get-Command rustc -ErrorAction SilentlyContinue)) {
        Invoke-WebRequest -Uri "https://win.rustup.rs" -OutFile "$env:TEMP\rustup-init.exe"
        Start-Process -FilePath "$env:TEMP\rustup-init.exe" -ArgumentList "-y" -Wait -NoNewWindow
        $env:Path += ";$env:USERPROFILE\.cargo\bin"
    }
    Write-ColorOutput "✓ Rust installed" -Type Success
    
    # Refresh environment variables
    RefreshEnv
    
    return $true
}

# Function to create directory structure
function New-DirectoryStructure {
    Write-ColorOutput "`nCreating directory structure..." -Type Info
    
    $directories = @(
        $Config.InstallPath,
        "$($Config.InstallPath)\bin",
        "$($Config.InstallPath)\config",
        "$($Config.InstallPath)\scripts",
        $Config.DataPath,
        "$($Config.DataPath)\database",
        "$($Config.DataPath)\cache",
        $Config.LogPath,
        "$($Config.DataPath)\backups"
    )
    
    foreach ($dir in $directories) {
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
            Write-ColorOutput "✓ Created: $dir" -Type Success
        }
    }
    
    return $true
}

# Function to clone repository
function Get-Repository {
    Write-ColorOutput "`nCloning ArbitrageX repository..." -Type Info
    
    $repoPath = "$($Config.InstallPath)\repo"
    
    if (Test-Path $repoPath) {
        Write-ColorOutput "Repository already exists. Updating..." -Type Warning
        Push-Location $repoPath
        git pull origin main
        Pop-Location
    } else {
        git clone $Config.RepositoryUrl $repoPath
    }
    
    Write-ColorOutput "✓ Repository ready" -Type Success
    return $repoPath
}

# Function to setup PostgreSQL database
function Initialize-Database {
    Write-ColorOutput "`nConfiguring PostgreSQL database..." -Type Info
    
    # Generate secure password
    $dbPassword = [System.Web.Security.Membership]::GeneratePassword(32, 8)
    
    # Initialize PostgreSQL if needed
    $pgPath = "C:\Program Files\PostgreSQL\14"
    if (Test-Path $pgPath) {
        $env:PGPASSWORD = "postgres"
        
        # Create user and database
        $sqlCommands = @"
CREATE USER $($Config.DatabaseUser) WITH PASSWORD '$dbPassword';
CREATE DATABASE $($Config.DatabaseName) OWNER $($Config.DatabaseUser);
GRANT ALL PRIVILEGES ON DATABASE $($Config.DatabaseName) TO $($Config.DatabaseUser);
"@
        
        $sqlCommands | & "$pgPath\bin\psql.exe" -U postgres -h localhost 2>$null
        
        # Save credentials securely
        $dbConfig = @{
            Host = "localhost"
            Port = 5432
            Database = $Config.DatabaseName
            User = $Config.DatabaseUser
            Password = $dbPassword
        }
        
        $dbConfig | ConvertTo-Json | Out-File "$($Config.InstallPath)\config\database.json" -Encoding UTF8
        Write-ColorOutput "✓ Database configured" -Type Success
        
        return $dbConfig
    } else {
        Write-ColorOutput "⚠ PostgreSQL not found. Please configure manually." -Type Warning
        return $null
    }
}

# Function to install npm dependencies
function Install-NpmDependencies {
    param([string]$RepoPath)
    
    Write-ColorOutput "`nInstalling npm dependencies..." -Type Info
    
    Push-Location $RepoPath
    
    if (Test-Path "package.json") {
        npm install --production
        Write-ColorOutput "✓ npm dependencies installed" -Type Success
    }
    
    Pop-Location
}

# Function to build Rust MEV engine
function Build-RustEngine {
    param([string]$RepoPath)
    
    Write-ColorOutput "`nBuilding Rust MEV engine..." -Type Info
    
    $rustPath = "$RepoPath\rust-mev-engine"
    if (Test-Path $rustPath) {
        Push-Location $rustPath
        
        cargo build --release
        
        # Copy binary to install location
        Copy-Item "target\release\rust-mev-engine.exe" "$($Config.InstallPath)\bin\" -Force
        
        Pop-Location
        Write-ColorOutput "✓ Rust MEV engine built" -Type Success
    } else {
        Write-ColorOutput "⚠ Rust source not found" -Type Warning
    }
}

# Function to create Windows services
function New-WindowsServices {
    Write-ColorOutput "`nCreating Windows services..." -Type Info
    
    # MEV Engine Service
    $mevServiceName = "ArbitrageXMEVEngine"
    $mevServicePath = "$($Config.InstallPath)\bin\rust-mev-engine.exe"
    
    if (Test-Path $mevServicePath) {
        nssm install $mevServiceName $mevServicePath
        nssm set $mevServiceName AppDirectory $Config.InstallPath
        nssm set $mevServiceName AppStdout "$($Config.LogPath)\mev-engine.log"
        nssm set $mevServiceName AppStderr "$($Config.LogPath)\mev-engine-error.log"
        nssm set $mevServiceName Description "ArbitrageX MEV Engine Service"
        nssm set $mevServiceName Start SERVICE_AUTO_START
        
        Write-ColorOutput "✓ MEV Engine service created" -Type Success
    }
    
    # Redis Service (if not already a service)
    $redisServiceName = "ArbitrageXRedis"
    $redisPath = (Get-Command redis-server -ErrorAction SilentlyContinue).Path
    
    if ($redisPath) {
        nssm install $redisServiceName $redisPath
        nssm set $redisServiceName AppDirectory (Split-Path $redisPath)
        nssm set $redisServiceName Description "ArbitrageX Redis Cache Service"
        nssm set $redisServiceName Start SERVICE_AUTO_START
        
        Write-ColorOutput "✓ Redis service created" -Type Success
    }
}

# Function to configure Windows Firewall
function Set-FirewallRules {
    Write-ColorOutput "`nConfiguring Windows Firewall..." -Type Info
    
    $rules = @(
        @{Name = "ArbitrageX-MEV-Engine"; Port = 8080; Protocol = "TCP"},
        @{Name = "ArbitrageX-API"; Port = 3000; Protocol = "TCP"},
        @{Name = "ArbitrageX-WebSocket"; Port = 8081; Protocol = "TCP"},
        @{Name = "ArbitrageX-Grafana"; Port = 3001; Protocol = "TCP"},
        @{Name = "ArbitrageX-Prometheus"; Port = 9090; Protocol = "TCP"}
    )
    
    foreach ($rule in $rules) {
        New-NetFirewallRule -DisplayName $rule.Name `
                           -Direction Inbound `
                           -Protocol $rule.Protocol `
                           -LocalPort $rule.Port `
                           -Action Allow `
                           -ErrorAction SilentlyContinue | Out-Null
        
        Write-ColorOutput "✓ Firewall rule added: $($rule.Name)" -Type Success
    }
}

# Function to create environment variables
function Set-EnvironmentVariables {
    param($DatabaseConfig)
    
    Write-ColorOutput "`nSetting environment variables..." -Type Info
    
    $envVars = @{
        ARBITRAGEX_HOME = $Config.InstallPath
        ARBITRAGEX_DATA = $Config.DataPath
        ARBITRAGEX_LOGS = $Config.LogPath
        NODE_ENV = "production"
    }
    
    if ($DatabaseConfig) {
        $envVars.DATABASE_URL = "postgresql://$($DatabaseConfig.User):$($DatabaseConfig.Password)@$($DatabaseConfig.Host):$($DatabaseConfig.Port)/$($DatabaseConfig.Database)"
    }
    
    foreach ($key in $envVars.Keys) {
        [Environment]::SetEnvironmentVariable($key, $envVars[$key], [EnvironmentVariableTarget]::Machine)
        Write-ColorOutput "✓ Set $key" -Type Success
    }
    
    # Update current session
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
}

# Function to create desktop shortcuts
function New-DesktopShortcuts {
    Write-ColorOutput "`nCreating desktop shortcuts..." -Type Info
    
    $desktop = [Environment]::GetFolderPath("Desktop")
    $WshShell = New-Object -ComObject WScript.Shell
    
    # Dashboard shortcut
    $dashboardShortcut = $WshShell.CreateShortcut("$desktop\ArbitrageX Dashboard.lnk")
    $dashboardShortcut.TargetPath = "http://localhost:3000"
    $dashboardShortcut.IconLocation = "$($Config.InstallPath)\icon.ico"
    $dashboardShortcut.Save()
    
    # Control Panel shortcut
    $controlShortcut = $WshShell.CreateShortcut("$desktop\ArbitrageX Control.lnk")
    $controlShortcut.TargetPath = "powershell.exe"
    $controlShortcut.Arguments = "-NoExit -Command `"& '$($Config.InstallPath)\scripts\control.ps1'`""
    $controlShortcut.WorkingDirectory = $Config.InstallPath
    $controlShortcut.IconLocation = "$($Config.InstallPath)\icon.ico"
    $controlShortcut.Save()
    
    Write-ColorOutput "✓ Desktop shortcuts created" -Type Success
}

# Function to create Start Menu entries
function New-StartMenuEntries {
    Write-ColorOutput "Creating Start Menu entries..." -Type Info
    
    $startMenu = "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\ArbitrageX"
    
    if (-not (Test-Path $startMenu)) {
        New-Item -ItemType Directory -Path $startMenu -Force | Out-Null
    }
    
    $WshShell = New-Object -ComObject WScript.Shell
    
    # Create shortcuts
    $shortcuts = @(
        @{Name = "Dashboard"; Target = "http://localhost:3000"},
        @{Name = "Start Services"; Target = "powershell.exe"; Args = "-Command `"& '$($Config.InstallPath)\scripts\start-services.ps1'`""},
        @{Name = "Stop Services"; Target = "powershell.exe"; Args = "-Command `"& '$($Config.InstallPath)\scripts\stop-services.ps1'`""},
        @{Name = "View Logs"; Target = "$($Config.LogPath)"},
        @{Name = "Uninstall"; Target = "powershell.exe"; Args = "-Command `"& '$($Config.InstallPath)\scripts\uninstall.ps1'`""}
    )
    
    foreach ($shortcut in $shortcuts) {
        $link = $WshShell.CreateShortcut("$startMenu\$($shortcut.Name).lnk")
        $link.TargetPath = $shortcut.Target
        if ($shortcut.Args) {
            $link.Arguments = $shortcut.Args
        }
        $link.Save()
    }
    
    Write-ColorOutput "✓ Start Menu entries created" -Type Success
}

# Function to create helper scripts
function New-HelperScripts {
    Write-ColorOutput "`nCreating helper scripts..." -Type Info
    
    # Start services script
    $startScript = @'
#Requires -RunAsAdministrator
Write-Host "Starting ArbitrageX services..." -ForegroundColor Green
Start-Service -Name "ArbitrageXMEVEngine" -ErrorAction SilentlyContinue
Start-Service -Name "ArbitrageXRedis" -ErrorAction SilentlyContinue
Start-Service -Name "postgresql-x64-14" -ErrorAction SilentlyContinue
Write-Host "Services started successfully!" -ForegroundColor Green
Read-Host "Press Enter to exit"
'@
    
    $startScript | Out-File "$($Config.InstallPath)\scripts\start-services.ps1" -Encoding UTF8
    
    # Stop services script
    $stopScript = @'
#Requires -RunAsAdministrator
Write-Host "Stopping ArbitrageX services..." -ForegroundColor Yellow
Stop-Service -Name "ArbitrageXMEVEngine" -ErrorAction SilentlyContinue
Stop-Service -Name "ArbitrageXRedis" -ErrorAction SilentlyContinue
Write-Host "Services stopped successfully!" -ForegroundColor Green
Read-Host "Press Enter to exit"
'@
    
    $stopScript | Out-File "$($Config.InstallPath)\scripts\stop-services.ps1" -Encoding UTF8
    
    # Health check script
    $healthScript = @'
Write-Host "`nArbitrageX Health Check" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan

# Check services
$services = @("ArbitrageXMEVEngine", "ArbitrageXRedis", "postgresql-x64-14")
foreach ($service in $services) {
    $svc = Get-Service -Name $service -ErrorAction SilentlyContinue
    if ($svc) {
        if ($svc.Status -eq "Running") {
            Write-Host "✓ $service is running" -ForegroundColor Green
        } else {
            Write-Host "✗ $service is stopped" -ForegroundColor Red
        }
    } else {
        Write-Host "⚠ $service not found" -ForegroundColor Yellow
    }
}

# Check ports
$ports = @(8080, 3000, 5432, 6379)
foreach ($port in $ports) {
    $connection = Test-NetConnection -ComputerName localhost -Port $port -InformationLevel Quiet
    if ($connection) {
        Write-Host "✓ Port $port is open" -ForegroundColor Green
    } else {
        Write-Host "✗ Port $port is closed" -ForegroundColor Red
    }
}

Read-Host "`nPress Enter to exit"
'@
    
    $healthScript | Out-File "$($Config.InstallPath)\scripts\health-check.ps1" -Encoding UTF8
    
    # Update script
    $updateScript = @'
#Requires -RunAsAdministrator
Write-Host "Updating ArbitrageX..." -ForegroundColor Cyan
$repoPath = "$env:ProgramFiles\ArbitrageX\repo"
Push-Location $repoPath
git pull origin main
npm install --production
cargo build --release
Pop-Location
Write-Host "Update completed!" -ForegroundColor Green
Read-Host "Press Enter to exit"
'@
    
    $updateScript | Out-File "$($Config.InstallPath)\scripts\update.ps1" -Encoding UTF8
    
    # Control panel script
    $controlScript = @'
function Show-Menu {
    Clear-Host
    Write-Host "╔═══════════════════════════════════════════════╗" -ForegroundColor Magenta
    Write-Host "║         ArbitrageX Control Panel              ║" -ForegroundColor Magenta
    Write-Host "╚═══════════════════════════════════════════════╝" -ForegroundColor Magenta
    Write-Host ""
    Write-Host "1. Start Services" -ForegroundColor Yellow
    Write-Host "2. Stop Services" -ForegroundColor Yellow
    Write-Host "3. Restart Services" -ForegroundColor Yellow
    Write-Host "4. Health Check" -ForegroundColor Yellow
    Write-Host "5. View Logs" -ForegroundColor Yellow
    Write-Host "6. Update ArbitrageX" -ForegroundColor Yellow
    Write-Host "7. Open Dashboard" -ForegroundColor Yellow
    Write-Host "8. Exit" -ForegroundColor Yellow
    Write-Host ""
}

do {
    Show-Menu
    $choice = Read-Host "Select an option"
    
    switch ($choice) {
        "1" { & "$env:ProgramFiles\ArbitrageX\scripts\start-services.ps1" }
        "2" { & "$env:ProgramFiles\ArbitrageX\scripts\stop-services.ps1" }
        "3" { 
            & "$env:ProgramFiles\ArbitrageX\scripts\stop-services.ps1"
            Start-Sleep -Seconds 2
            & "$env:ProgramFiles\ArbitrageX\scripts\start-services.ps1"
        }
        "4" { & "$env:ProgramFiles\ArbitrageX\scripts\health-check.ps1" }
        "5" { Start-Process explorer.exe "$env:ProgramData\ArbitrageX\Logs" }
        "6" { & "$env:ProgramFiles\ArbitrageX\scripts\update.ps1" }
        "7" { Start-Process "http://localhost:3000" }
        "8" { exit }
        default { Write-Host "Invalid option" -ForegroundColor Red; Start-Sleep -Seconds 2 }
    }
} while ($choice -ne "8")
'@
    
    $controlScript | Out-File "$($Config.InstallPath)\scripts\control.ps1" -Encoding UTF8
    
    Write-ColorOutput "✓ Helper scripts created" -Type Success
}

# Function to create uninstall script
function New-UninstallScript {
    Write-ColorOutput "Creating uninstall script..." -Type Info
    
    $uninstallScript = @"
#Requires -RunAsAdministrator

Write-Host "ArbitrageX Uninstaller" -ForegroundColor Red
Write-Host "======================" -ForegroundColor Red
Write-Host ""
`$confirm = Read-Host "Are you sure you want to uninstall ArbitrageX? (yes/no)"

if (`$confirm -eq "yes") {
    Write-Host "Stopping services..." -ForegroundColor Yellow
    Stop-Service -Name "ArbitrageXMEVEngine" -ErrorAction SilentlyContinue
    Stop-Service -Name "ArbitrageXRedis" -ErrorAction SilentlyContinue
    
    Write-Host "Removing services..." -ForegroundColor Yellow
    nssm remove "ArbitrageXMEVEngine" confirm
    nssm remove "ArbitrageXRedis" confirm
    
    Write-Host "Removing firewall rules..." -ForegroundColor Yellow
    Remove-NetFirewallRule -DisplayName "ArbitrageX-*" -ErrorAction SilentlyContinue
    
    Write-Host "Removing environment variables..." -ForegroundColor Yellow
    [Environment]::SetEnvironmentVariable("ARBITRAGEX_HOME", `$null, [EnvironmentVariableTarget]::Machine)
    [Environment]::SetEnvironmentVariable("ARBITRAGEX_DATA", `$null, [EnvironmentVariableTarget]::Machine)
    [Environment]::SetEnvironmentVariable("ARBITRAGEX_LOGS", `$null, [EnvironmentVariableTarget]::Machine)
    
    Write-Host "Removing shortcuts..." -ForegroundColor Yellow
    Remove-Item "`$env:USERPROFILE\Desktop\ArbitrageX*.lnk" -ErrorAction SilentlyContinue
    Remove-Item "`$env:ProgramData\Microsoft\Windows\Start Menu\Programs\ArbitrageX" -Recurse -ErrorAction SilentlyContinue
    
    Write-Host "Removing files..." -ForegroundColor Yellow
    Remove-Item "$($Config.InstallPath)" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item "$($Config.DataPath)" -Recurse -Force -ErrorAction SilentlyContinue
    
    Write-Host "Uninstall completed!" -ForegroundColor Green
} else {
    Write-Host "Uninstall cancelled." -ForegroundColor Yellow
}

Read-Host "Press Enter to exit"
"@
    
    $uninstallScript | Out-File "$($Config.InstallPath)\scripts\uninstall.ps1" -Encoding UTF8
    Write-ColorOutput "✓ Uninstall script created" -Type Success
}

# Function to show installation summary
function Show-Summary {
    param($DatabaseConfig)
    
    Write-ColorOutput "`n╔═══════════════════════════════════════════════════════════════╗" -Type Header
    Write-ColorOutput "║                   Installation Complete!                       ║" -Type Header
    Write-ColorOutput "╚═══════════════════════════════════════════════════════════════╝" -Type Header
    
    Write-ColorOutput "`nInstallation Details:" -Type Info
    Write-ColorOutput "  Install Path: $($Config.InstallPath)" -Type Success
    Write-ColorOutput "  Data Path: $($Config.DataPath)" -Type Success
    Write-ColorOutput "  Log Path: $($Config.LogPath)" -Type Success
    
    if ($DatabaseConfig) {
        Write-ColorOutput "`nDatabase Configuration:" -Type Info
        Write-ColorOutput "  Host: $($DatabaseConfig.Host)" -Type Success
        Write-ColorOutput "  Database: $($DatabaseConfig.Database)" -Type Success
        Write-ColorOutput "  User: $($DatabaseConfig.User)" -Type Success
        Write-ColorOutput "  Credentials saved to: $($Config.InstallPath)\config\database.json" -Type Warning
    }
    
    Write-ColorOutput "`nServices:" -Type Info
    Write-ColorOutput "  • ArbitrageXMEVEngine - MEV Engine Service" -Type Success
    Write-ColorOutput "  • ArbitrageXRedis - Redis Cache Service" -Type Success
    Write-ColorOutput "  • PostgreSQL - Database Service" -Type Success
    
    Write-ColorOutput "`nAccess Points:" -Type Info
    Write-ColorOutput "  Dashboard: http://localhost:3000" -Type Success
    Write-ColorOutput "  API: http://localhost:8080" -Type Success
    Write-ColorOutput "  Grafana: http://localhost:3001" -Type Success
    Write-ColorOutput "  Prometheus: http://localhost:9090" -Type Success
    
    Write-ColorOutput "`nQuick Start:" -Type Info
    Write-ColorOutput "  1. Use desktop shortcuts to access the dashboard" -Type Success
    Write-ColorOutput "  2. Use Control Panel shortcut to manage services" -Type Success
    Write-ColorOutput "  3. Check Start Menu for additional options" -Type Success
    
    Write-ColorOutput "`n⚠ Important: Save database credentials from $($Config.InstallPath)\config\database.json" -Type Warning
}

# Main installation function
function Start-Installation {
    try {
        Show-Header
        
        # Run checks
        Test-WindowsVersion
        Test-SystemRequirements
        
        # Install components
        Install-Chocolatey
        Install-Prerequisites
        
        # Setup application
        New-DirectoryStructure
        $repoPath = Get-Repository
        $dbConfig = Initialize-Database
        Install-NpmDependencies -RepoPath $repoPath
        Build-RustEngine -RepoPath $repoPath
        
        # Configure system
        New-WindowsServices
        Set-FirewallRules
        Set-EnvironmentVariables -DatabaseConfig $dbConfig
        
        # Create user interface
        New-DesktopShortcuts
        New-StartMenuEntries
        New-HelperScripts
        New-UninstallScript
        
        # Show summary
        Show-Summary -DatabaseConfig $dbConfig
        
        Write-ColorOutput "`n✅ Installation completed successfully!" -Type Success
        
        $startNow = Read-Host "`nWould you like to start the services now? (yes/no)"
        if ($startNow -eq "yes") {
            & "$($Config.InstallPath)\scripts\start-services.ps1"
        }
        
    } catch {
        Write-ColorOutput "`n❌ Installation failed: $_" -Type Error
        Write-ColorOutput $_.ScriptStackTrace -Type Error
        exit 1
    }
}

# Run the installation
Start-Installation

Write-Host "`nPress any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")