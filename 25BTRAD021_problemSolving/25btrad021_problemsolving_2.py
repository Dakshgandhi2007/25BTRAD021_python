# Mini Project (Unit 2): OTP Generator and Verifier
# Generates a random numeric OTP, "sends" it (prints it), then verifies what the user types.
# Rules: OTP expires after 60 seconds, 3 attempts per OTP, 3 resends allowed per login.
# Author: Daksh Gandhi | CSE-AIDE-A, JAIN (Deemed-to-be University)
import random
import time

OTP_LENGTH = 6
VALIDITY_SECONDS = 60
MAX_ATTEMPTS = 3
MAX_RESENDS = 3


def generate_otp(length=OTP_LENGTH):
    """Return a random numeric OTP of the given length (leading zeros allowed)."""
    otp = ""
    for _ in range(length):
        otp += str(random.randint(0, 9))
    return otp


def validate_mobile(number):
    """A valid mobile number has 10 digits and starts with 6, 7, 8 or 9."""
    return number.isdigit() and len(number) == 10 and number[0] in "6789"


def mask(number):
    return "XXXXXX" + number[-4:]


def verify_otp(entered, real, created_at):
    """Return (ok, message) after checking format, expiry and match."""
    if not entered.isdigit() or len(entered) != OTP_LENGTH:
        return False, f"OTP must be exactly {OTP_LENGTH} digits."
    if time.time() - created_at > VALIDITY_SECONDS:
        return False, "expired"
    if entered != real:
        return False, "wrong"
    return True, "OTP verified. Login successful!"


def login():
    number = input("Enter mobile number: ").strip()
    if not validate_mobile(number):
        print("Invalid mobile number. Enter 10 digits starting with 6-9.")
        return

    resends = 0
    while True:
        otp = generate_otp()
        created_at = time.time()
        print(f"\n[SMS to {mask(number)}] Your OTP is {otp}. Valid for {VALIDITY_SECONDS} seconds.")

        attempts = 0
        expired = False
        while attempts < MAX_ATTEMPTS:
            entered = input("Enter OTP: ").strip()
            ok, msg = verify_otp(entered, otp, created_at)
            if ok:
                print(msg)
                return
            if msg == "expired":
                print("OTP expired.")
                expired = True
                break
            if msg == "wrong":
                attempts += 1
                print(f"Incorrect OTP. Attempts left: {MAX_ATTEMPTS - attempts}")
            else:
                print(msg)          # bad format does not use up an attempt

        if not expired:
            print("Too many wrong attempts. This OTP is now blocked.")

        if resends >= MAX_RESENDS:
            print("Resend limit reached. Please try again later.")
            return
        if input("Send a new OTP? (y/n): ").strip().lower() != "y":
            print("Login cancelled.")
            return
        resends += 1


while True:
    print("\n===== OTP LOGIN SYSTEM =====")
    print("1. Login with OTP")
    print("2. Exit")
    ch = input("Enter choice: ")
    if ch == "1":
        login()
    elif ch == "2":
        print("Goodbye!")
        break
    else:
        print("Invalid choice.")
