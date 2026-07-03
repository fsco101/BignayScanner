"""
Ngrok Tunnel Setup Script
Creates a secure tunnel for mobile device access
"""

import os
import sys
import json
import time
import socket
import subprocess
import threading
from pathlib import Path

# Configuration
BACKEND_PORT = 5000
NGROK_AUTH_TOKEN = None  # Set this or use environment variable

def check_ngrok_installed():
    """Check if ngrok is installed"""
    try:
        result = subprocess.run(['ngrok', 'version'], capture_output=True, text=True)
        if result.returncode == 0:
            print(f"✓ ngrok is installed: {result.stdout.strip()}")
            return True
    except FileNotFoundError:
        pass
    return False

def install_ngrok_instructions():
    """Print instructions to install ngrok"""
    print("\n" + "=" * 60)
    print("NGROK INSTALLATION REQUIRED")
    print("=" * 60)
    print("\nngrok is not installed. Please install it:")
    print("\n1. Download from: https://ngrok.com/download")
    print("2. Extract and add to PATH")
    print("3. Sign up at https://ngrok.com and get your auth token")
    print("4. Run: ngrok config add-authtoken YOUR_AUTH_TOKEN")
    print("\nAlternatively, install via package managers:")
    print("  - Windows (Chocolatey): choco install ngrok")
    print("  - Windows (Scoop): scoop install ngrok")
    print("  - macOS: brew install ngrok")
    print("=" * 60)

def configure_ngrok_auth(token):
    """Configure ngrok auth token"""
    try:
        result = subprocess.run(
            ['ngrok', 'config', 'add-authtoken', token],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            print("✓ ngrok auth token configured")
            return True
        else:
            print(f"✗ Failed to configure auth token: {result.stderr}")
            return False
    except Exception as e:
        print(f"✗ Error configuring auth token: {e}")
        return False

def get_ngrok_tunnel_url(max_attempts=10, interval=2):
    """Get the public URL from running ngrok tunnel, with retries"""
    try:
        import requests
    except ImportError:
        print("✗ 'requests' module not installed — cannot query ngrok API")
        return None

    for attempt in range(1, max_attempts + 1):
        try:
            response = requests.get('http://127.0.0.1:4040/api/tunnels', timeout=3)
            tunnels = response.json().get('tunnels', [])
            for tunnel in tunnels:
                if tunnel.get('proto') == 'https':
                    return tunnel.get('public_url')
            # Fallback to http if no https
            for tunnel in tunnels:
                return tunnel.get('public_url')
            # API responded but no tunnels yet — keep waiting
            if attempt < max_attempts:
                time.sleep(interval)
        except Exception:
            # ngrok local API not ready yet
            if attempt < max_attempts:
                time.sleep(interval)
    return None

def get_local_ip():
    """Detect the local network IP address"""
    try:
        # Connect to an external address to determine the local IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(2)
        s.connect(('8.8.8.8', 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception:
        return '127.0.0.1'

def update_frontend_env(tunnel_url):
    """Update frontend .env file with tunnel URL and local network URL"""
    frontend_dir = Path(__file__).parent.parent / 'frontend'
    env_file = frontend_dir / '.env'
    
    local_ip = get_local_ip()
    local_url = f"http://{local_ip}:{BACKEND_PORT}"
    
    if not env_file.exists():
        print(f"Creating frontend .env file at {env_file}")
    
    # Read existing content
    existing_lines = []
    if env_file.exists():
        with open(env_file, 'r') as f:
            existing_lines = f.readlines()
    
    # Update or add EXPO_PUBLIC_API_URL and EXPO_PUBLIC_LOCAL_API_URL
    new_lines = []
    api_url_updated = False
    local_url_updated = False
    
    for line in existing_lines:
        stripped = line.strip()
        if stripped.startswith('EXPO_PUBLIC_API_URL=') and not stripped.startswith('#'):
            new_lines.append(f"EXPO_PUBLIC_API_URL={tunnel_url}\n")
            api_url_updated = True
        elif stripped.startswith('EXPO_PUBLIC_LOCAL_API_URL=') and not stripped.startswith('#'):
            new_lines.append(f"EXPO_PUBLIC_LOCAL_API_URL={local_url}\n")
            local_url_updated = True
        else:
            new_lines.append(line)
    
    if not api_url_updated:
        new_lines.append(f"\n# Ngrok Tunnel URL (auto-generated)\n")
        new_lines.append(f"EXPO_PUBLIC_API_URL={tunnel_url}\n")
    
    if not local_url_updated:
        new_lines.append(f"\n# Local Network URL (auto-generated)\n")
        new_lines.append(f"EXPO_PUBLIC_LOCAL_API_URL={local_url}\n")
    
    with open(env_file, 'w') as f:
        f.writelines(new_lines)
    
    print(f"✓ Updated frontend .env:")
    print(f"  Ngrok URL: {tunnel_url}")
    print(f"  Local URL: {local_url}")
    return True

def wait_for_backend(port=BACKEND_PORT, timeout=15):
    """Wait for the backend server to be ready on the given port"""
    import urllib.request
    start = time.time()
    while time.time() - start < timeout:
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=2)
            return True
        except Exception:
            time.sleep(1)
    return False

def start_backend_server(port=BACKEND_PORT):
    """Start the Flask backend server as a subprocess"""
    backend_dir = Path(__file__).parent
    app_py = backend_dir / 'app.py'

    if not app_py.exists():
        print(f"✗ Could not find {app_py}")
        return None

    # Check if something is already listening on the port
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(1)
        s.connect(('127.0.0.1', port))
        s.close()
        print(f"✓ Backend already running on port {port}")
        return 'already_running'
    except Exception:
        pass

    print(f"🚀 Starting Flask backend (python app.py) on port {port}...")

    # Determine the python executable (prefer venv)
    venv_python = backend_dir.parent / 'venv' / 'Scripts' / 'python.exe'
    if venv_python.exists():
        python_exe = str(venv_python)
    else:
        python_exe = sys.executable

    # Stream backend output to the console so logs are visible
    process = subprocess.Popen(
        [python_exe, str(app_py)],
        cwd=str(backend_dir),
    )

    print("Waiting for backend to become ready...")
    if wait_for_backend(port):
        print(f"✓ Backend is running on http://127.0.0.1:{port}")
        return process
    else:
        print("✗ Backend did not start in time. Check for errors.")
        return None

def start_ngrok_tunnel(port=BACKEND_PORT):
    """Start ngrok tunnel for the backend"""
    print(f"\n🚀 Starting ngrok tunnel for port {port}...")
    
    try:
        # Kill any leftover ngrok processes to avoid port-4040 conflicts
        subprocess.run(
            ['taskkill', '/F', '/IM', 'ngrok.exe'],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
        time.sleep(1)

        # Start ngrok in background — use 127.0.0.1 instead of localhost
        # to avoid IPv6 resolution issues (ERR_NGROK_8012)
        process = subprocess.Popen(
            ['ngrok', 'http', f'127.0.0.1:{port}'],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE
        )
        
        # Wait briefly then check if process crashed immediately
        time.sleep(2)
        if process.poll() is not None:
            stderr_output = process.stderr.read().decode(errors='replace').strip()
            print(f"✗ ngrok exited immediately (code {process.returncode})")
            if stderr_output:
                print(f"  Error: {stderr_output[:500]}")
            return None, None
        
        # Poll ngrok API for the tunnel URL (retries built in)
        print("Waiting for tunnel to establish...")
        tunnel_url = get_ngrok_tunnel_url(max_attempts=10, interval=2)
        
        if tunnel_url:
            local_ip = get_local_ip()
            print("\n" + "=" * 60)
            print("🎉 NGROK TUNNEL ACTIVE")
            print("=" * 60)
            print(f"\n📱 Public URL (ngrok):    {tunnel_url}")
            print(f"🖥️  Network URL:           http://{local_ip}:{port}")
            print(f"🖥️  Localhost URL:          http://localhost:{port}")
            print(f"\n📋 Backend bound to 0.0.0.0:{port} (accessible from any network)")
            print("📋 Use ngrok URL for devices outside your local network")
            print("📋 Use network URL for devices on the same WiFi")
            print("=" * 60)
            
            # Update frontend .env
            update_frontend_env(tunnel_url)
            
            print("\n⚠️  Press Ctrl+C to stop the tunnel")
            print("=" * 60)
            
            return process, tunnel_url
        else:
            # Tunnel didn't appear — check if ngrok is still alive and grab its error
            stderr_output = ''
            if process.poll() is not None:
                stderr_output = process.stderr.read().decode(errors='replace').strip()
            print("✗ Failed to get tunnel URL after multiple attempts")
            if stderr_output:
                print(f"  ngrok error: {stderr_output[:500]}")
            else:
                print("  Tip: Ensure your ngrok auth token is configured:")
                print("       ngrok config add-authtoken YOUR_TOKEN")
            if process.poll() is None:
                process.terminate()
            return None, None
            
    except Exception as e:
        print(f"✗ Error starting tunnel: {e}")
        return None, None

def main():
    print("\n" + "=" * 60)
    print("🌐 BIGNAY APP - NGROK TUNNEL SETUP")
    print("=" * 60)
    
    # Check if ngrok is installed
    if not check_ngrok_installed():
        install_ngrok_instructions()
        return
    
    # Check for auth token
    auth_token = os.environ.get('NGROK_AUTH_TOKEN') or NGROK_AUTH_TOKEN
    if auth_token:
        configure_ngrok_auth(auth_token)
    
    # Start the backend server if not already running
    backend_process = start_backend_server()
    if backend_process is None:
        print("✗ Cannot proceed without backend server")
        return
    
    # Start the tunnel
    process, tunnel_url = start_ngrok_tunnel()
    
    if process:
        try:
            # Keep running until interrupted
            while True:
                time.sleep(1)
                # Check if ngrok process is still running
                if process.poll() is not None:
                    print("\n✗ ngrok process ended unexpectedly")
                    break
                # Check if backend process is still running (if we started it)
                if backend_process not in ('already_running',) and backend_process.poll() is not None:
                    print("\n✗ Backend process ended unexpectedly")
                    break
        except KeyboardInterrupt:
            print("\n\n🛑 Stopping...")
            process.terminate()
            print("✓ ngrok tunnel stopped")
            if backend_process not in ('already_running',):
                backend_process.terminate()
                print("✓ Backend server stopped")
    
    print("\n👋 Goodbye!")

if __name__ == '__main__':
    main()
