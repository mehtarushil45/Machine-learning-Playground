# services/worker package root
import os
import sys

_api_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "api"))
if _api_dir not in sys.path:
    sys.path.insert(0, _api_dir)
