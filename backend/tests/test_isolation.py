import subprocess
import sys


def test_fresh_import_startup_and_routes_without_database_hardware_or_network():
    # Fresh process guards imports before app import, including TestClient startup.
    code = """
import builtins
import os
import socket
import threading

for name in tuple(os.environ):
    if name.startswith('LWA_REPORTING_'):
        del os.environ[name]

original_import = builtins.__import__
forbidden = {'pyodbc', 'pymssql', 'sqlalchemy', 'pyvisa', 'serial', 'infrastructure', 'hardware'}
def guarded_import(name, *args, **kwargs):
    if name.split('.')[0] in forbidden or 'op815' in name.lower():
        raise AssertionError('Database/hardware import attempted: ' + name)
    return original_import(name, *args, **kwargs)
builtins.__import__ = guarded_import
original_connect = socket.socket.connect
original_socketpair = socket.socketpair
internal_pair = threading.local()
def local_socketpair(*args, **kwargs):
    # Windows asyncio implements its internal wakeup pipe as a loopback pair.
    internal_pair.active = True
    try:
        return original_socketpair(*args, **kwargs)
    finally:
        internal_pair.active = False
def no_connection(*args, **kwargs):
    raise AssertionError('Network connection attempted')
def guarded_connect(sock, address):
    if getattr(internal_pair, 'active', False) and address[0] in {'127.0.0.1', '::1'}:
        return original_connect(sock, address)
    return no_connection()
socket.socketpair = local_socketpair
socket.socket.connect = guarded_connect
socket.socket.connect_ex = no_connection
socket.create_connection = no_connection

from fastapi.testclient import TestClient
import ctypes
ctypes.CDLL = no_connection
if hasattr(ctypes, 'WinDLL'):
    ctypes.WinDLL = no_connection
from app.main import app
from app.reporting.adapter import ReportingError, SqlServerAdapter
from app.reporting.config import ReportingSettings
from app.reporting.repository import SqlServerReportingRepository
try:
    SqlServerReportingRepository(SqlServerAdapter(ReportingSettings())).check_schema()
except ReportingError as error:
    assert error.code == 'disabled'
else:
    raise AssertionError('Disabled reporting unexpectedly succeeded')
with TestClient(app) as client:
    for route in ['/api/v1/health/live', '/api/v1/system/info', '/api/v1/demo/runs']:
        assert client.get(route).status_code == 200
    response = client.get(
        '/api/v1/reporting/run-activity',
        params={
            'started_from': '2026-11-01T00:00:00Z',
            'started_before': '2026-11-02T00:00:00Z',
        },
    )
    assert response.json() == {'data_source': 'not_connected'}
"""
    result = subprocess.run(
        [sys.executable, "-c", code], capture_output=True, text=True, timeout=30
    )
    assert result.returncode == 0, result.stdout + result.stderr
