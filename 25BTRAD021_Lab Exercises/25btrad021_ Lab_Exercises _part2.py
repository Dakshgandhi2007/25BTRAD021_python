Lab Exercise 5 — Number guessing game:
import random
number = random.randint(1, 100)
attempts = 0
print("Guess the number between 1 and 100")
while True:
    guess = int(input("Enter your guess: "))
    attempts += 1
    if guess < number:
        print("Too Low!")
    elif guess > number:
        print("Too High!")
    else:
        print(f"Correct! You guessed it in {attempts} attempts.")
        break


#Lab Exercise 6 — Prime + Factorial:

# Prime Number
n = int(input("Enter a number: "))
is_prime = True
if n < 2:
    is_prime = False
else:
    for i in range(2, n):
        if n % i == 0:
            is_prime = False
            break
print(f"{n} is {'Prime' if is_prime else 'Not Prime'}")
print()


# Factorial
n = int(input("Enter a number for factorial: "))
result = 1
for i in range(1, n + 1):
    result *= i
print(f"Factorial of {n} = {result}")


#Lab Exercise 7 — Fibonacci using recursion:
def fibonacci(n):
    if n == 0:
        return 0
    elif n == 1:
        return 1
    else:
        return fibonacci(n - 1) + fibonacci(n - 2)
n = int(input("Enter number of terms: "))
print("Fibonacci Series:")
for i in range(n):
    print(fibonacci(i), end=" ")
