print("Hello, World!")
print("Welcome to Python Programming")


# Lab Exercise 3 — Variables, operators, input/output:




# Variables
name = input("Enter your name: ")
age = int(input("Enter your age: "))
marks = float(input("Enter your marks: "))


# Operators
percentage = (marks / 100) * 100
birth_year = 2025 - age


# Output
print(f"Name: {name}")
print(f"Age: {age}")
print(f"Birth Year: {birth_year}")
print(f"Marks: {marks}")
print(f"Percentage: {percentage:.2f}%")


#Lab Exercise 4 — Calculator + Area:




# Simple Calculator
a = float(input("Enter first number: "))
b = float(input("Enter second number: "))


print(f"Addition:       {a + b}")
print(f"Subtraction:    {a - b}")
print(f"Multiplication: {a * b}")
print(f"Division:       {a / b:.2f}")


print()


# Area Calculations
r = float(input("Enter radius of circle: "))
l = float(input("Enter length of rectangle: "))
w = float(input("Enter width of rectangle: "))
s = float(input("Enter side of square: "))


print(f"Area of Circle:    {3.14159 * r * r:.2f}")
print(f"Area of Rectangle: {l * w:.2f}")
print(f"Area of Square:    {s * s:.2f}")


