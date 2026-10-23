"""The CAD kernel's own messages, kept off a command's stdout.

Studio's copy of cadgen 0.7's ``kernel_messages_on_stderr`` (cadgen 0.8 removed it with the STEP
scene loader), for Studio's FEA, which reads STEP parts and answers JSON on stdout.
"""

from __future__ import annotations

import contextlib
import os
import sys
from collections.abc import Iterator

__all__ = ["kernel_messages_on_stderr"]


@contextlib.contextmanager
def kernel_messages_on_stderr() -> Iterator[None]:
    """Route the CAD kernel's diagnostics to stderr while a STEP is read.

    OCCT's readers print their parse diagnostics (``**** ERR StepFile ...``) to the C-level stdout,
    which is where a CLI's result belongs: a malformed document would otherwise corrupt the JSON on
    stdout. The redirect is at the file-descriptor level because the kernel does not write through
    Python's ``sys.stdout``.
    """
    sys.stdout.flush()
    sys.stderr.flush()
    try:
        saved = os.dup(1)
    except OSError:
        yield
        return
    try:
        os.dup2(2, 1)
        yield
    finally:
        sys.stdout.flush()
        os.dup2(saved, 1)
        os.close(saved)
