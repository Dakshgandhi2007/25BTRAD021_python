# Mini Project: Bill Generator
# Author: Daksh Gandhi | CSE-AIDE-A, JAIN (Deemed-to-be University)
GST_RATE = 18 # percent
DISCOUNT_LIMIT = 1000 # bill above this gets a discount
DISCOUNT_RATE = 10 # percent
print("=" * 40)
print(" WELCOME TO DAKSH MART")
print("=" * 40)
customer = input("Enter customer name: ")
items = [] # each item: [name, price, quantity]
while True:
name = input("\nEnter item name (or 'done' to finish): ")
if name.lower() == "done":
break
price = float(input("Enter price per unit: "))
qty = int(input("Enter quantity: "))
items.append([name, price, qty])
if len(items) == 0:
print("\nNo items added. Bill not generated.")
else:
subtotal = 0
print("\n" + "=" * 40)
print(f"Customer: {customer}")
print("=" * 40)
print(f"{'Item':<14}{'Qty':>4}{'Price':>10}{'Total':>12}")
print("-" * 40)
for name, price, qty in items:
total = price * qty
subtotal += total
print(f"{name:<14}{qty:>4}{price:>10.2f}{total:>12.2f}")
print("-" * 40)
# discount only if the bill is big enough
discount = 0
if subtotal > DISCOUNT_LIMIT:
discount = subtotal * DISCOUNT_RATE / 100
taxable = subtotal - discount
gst = taxable * GST_RATE / 100
grand_total = taxable + gst
print(f"{'Subtotal':<28}{subtotal:>12.2f}")
if discount > 0:
print(f"{'Discount (' + str(DISCOUNT_RATE) + '%)':<28}{'-' + format(discount, '.2f'):>12}")
print(f"{'GST (' + str(GST_RATE) + '%)':<28}{gst:>12.2f}")
print("=" * 40)
print(f"{'GRAND TOTAL':<28}{grand_total:>12.2f}")
print("=" * 40)
print(" Thank you! Visit again :)")
