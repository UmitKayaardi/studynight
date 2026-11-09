# Python: Lists and Loops

## Lists

A list in Python stores an ordered collection of items. Lists are written with square brackets, and items are separated by commas.

```python
scores = [72, 85, 90]
```

Each item has a position called an index. Indexing starts at 0, so `scores[0]` is the first item, 72. Negative indexes count from the end: `scores[-1]` is the last item, 90.

Lists are mutable, which means they can be changed after they are created. The `append` method adds an item to the end of a list:

```python
scores.append(64)
print(scores)
```

This prints `[72, 85, 90, 64]`. The built-in function `len` returns the number of items in a list, so `len(scores)` is now 4.

A slice takes part of a list. `scores[1:3]` returns a new list containing the items at index 1 and 2, but not index 3. Here that is `[85, 90]`.

## For loops

A `for` loop repeats a block of code once for each item in a list.

```python
total = 0
for s in scores:
    total = total + s
print(total)
```

With the list `[72, 85, 90, 64]`, this code prints `311`. The indented lines form the body of the loop. Python uses indentation, not brackets, to show which lines belong to the loop.

The `range` function produces a sequence of numbers. `range(3)` gives 0, 1 and 2, so the following loop prints those three numbers on separate lines:

```python
for i in range(3):
    print(i)
```

## While loops

A `while` loop repeats as long as a condition is true. It is useful when the number of repetitions is not known in advance.

```python
n = 1
while n < 100:
    n = n * 2
print(n)
```

This prints `128`, the first power of two that is not less than 100. If the condition never becomes false, the loop runs forever; this is called an infinite loop.

## List comprehensions

A list comprehension builds a new list in a single line. For example, `[s * 2 for s in [1, 2, 3]]` produces `[2, 4, 6]`. A condition can be added to keep only some items: `[s for s in scores if s >= 80]` keeps only the scores of 80 or more.
