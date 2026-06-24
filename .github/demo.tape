# VHS Demo — mcp-security-scanner
Output .github/demo.gif

Set Shell "bash"
Set FontSize 14
Set Width 1000
Set Height 600
Set Theme "Catppuccin Mocha"
Set Padding 20
Set TypingSpeed 30ms

# Show help
Type `npx -y mcp-security-scanner --help`
Sleep 300ms
Enter
Sleep 6s

# Run SAST scan
Type `npx -y mcp-security-scanner --tool sast_scan_directory '{"path":"./src"}'`
Sleep 300ms
Enter
Sleep 6s

# Check for typosquatting
Type `npx -y mcp-security-scanner --tool dep_check_typosquatting '{"path":"."}'`
Sleep 300ms
Enter
Sleep 6s

# Discover MCP configs
Type `npx -y mcp-security-scanner --discover`
Sleep 300ms
Enter
Sleep 6s

Sleep 2s
