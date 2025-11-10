import os
import asyncio
from typing import AsyncIterator, TextIO

async def async_tail(file: TextIO, cancellation: asyncio.Event | None = None) -> AsyncIterator[str]:
    """
    Returns an asynchronous iterator yielding each new line added to a file.

    Args:
        file (TextIO): The file to watch.

    Returns:
        An asynchronous iterator yielding each new line added to a file.
    """

    file.seek(0, os.SEEK_END)

    def _sync_get_new_line():
        while cancellation == None or not cancellation.is_set():
            new_line = file.readline()

            if new_line:
                return new_line.strip()

    while cancellation == None or not cancellation.is_set():
        line = await asyncio.to_thread(_sync_get_new_line)
        if line:
            yield line
