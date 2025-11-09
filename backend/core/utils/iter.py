from typing import TypeVar, Generic, Iterable, AsyncIterator

T = TypeVar('T') # Represents the yield type of the iterator

async def to_async_iter(sync_iter: Iterable[T]) -> AsyncIterator[T]:
    """
    Turns a synchronous iterator into an asynchronous one.

    Useful to pass synchronous iterators into functions that expect an
    asynchronous one, without changing the behavior of the iterator.

    Type Params:
        T: The yield type of the synchronous iterator, to be yielded by the
        returned iterator.

    Args:
        sync_iter (Iterable[T]): The synchronous iterator to be transformed.

    Returns:
        The transformed, now asynchronous iterator.
    """
    for item in sync_iter:
        yield item
