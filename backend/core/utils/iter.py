from typing import TypeVar, Generic, Iterable, AsyncIterable, AsyncIterator

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

async def async_chain(first: AsyncIterable[T], second: AsyncIterable[T]) -> AsyncIterator[T]:
    """
    Iterator that exhausts the first iterator, then exhausts the second
    iterator.

    Type Params:
        T: The yield type of both input iterators, and the output iterator.

    Args:
        first (AsyncIterable[T]): The first iterator to be exhausted.
        second (AsyncIterable[T]): The second iterator to be exhausted.

    Returns:
        An iterator that will yield all the values from the first one,
        followed by all the values in the second one.
    """

    async for item in first:
        yield item
    async for item in second:
        yield item
