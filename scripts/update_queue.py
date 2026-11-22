import json

data = {
  "records": [
    {
      "id": "ec17f63765cb9af7aaaa742deefc1113d1cc5340ce050f6d4ce653e1d57eb9d2",
      "status": "READY_TO_SYNC",
      "reason": "Reconciled via Layer D (Recharge Cross-Source Match)",
      "createdAtMs": 1794043170105,
      "retryCount": 0,
      "notified": False,
      "parsed": {
        "amountPaise": 1500,
        "merchant": "Jio",
        "reference": "10005862230440",
        "transactionDate": "2026-11-08",
        "transactionDateTime": None,
        "status": "DEBIT",
        "categorySuggestion": "Mobile Recharge",
        "note": "Recharge 15.00",
        "sender": "JD-JioPay-S",
        "timestampMs": 1794043170105,
        "evidence": "amount=₹15.00; sender=JD-JioPay-S",
        "accountSuffix": "4375",
        "bankName": "Salem District Central Co-operative Bank",
        "availableBalancePaise": 1211809,
        "classification": "RECHARGE",
        "confidence": "HIGH"
      }
    },
    {
      "id": "407b0fca7458ab32f1398f9f2afb4d5b94c3d2b9927d390894527de1af5dc4d8",
      "status": "READY_TO_SYNC",
      "reason": "Reconciled via Layer C (Bank CBS/UPI Dual Notification)",
      "createdAtMs": 1794032114108,
      "retryCount": 0,
      "notified": False,
      "parsed": {
        "amountPaise": 1000,
        "merchant": "Salem District Central Co-operative Bank",
        "reference": "132502639405",
        "transactionDate": "2026-11-07",
        "transactionDateTime": None,
        "status": "DEBIT",
        "categorySuggestion": "Mobile Recharge",
        "note": "ref: 132502639405; sms-status: debit",
        "sender": "JD-SDCCBL-S",
        "timestampMs": 1794032114108,
        "evidence": "amount=₹10.00; ref=132502639405; date=2026-11-07; sender=JD-SDCCBL-S",
        "availableBalancePaise": 1213309,
        "accountSuffix": "4375",
        "bankName": "Salem District Central Co-operative Bank",
        "classification": "BANK_DEBIT",
        "confidence": "HIGH"
      }
    },
    {
      "id": "7c3017ab0fa2833d494929242c2b237f125794f8a9e48b34a9778d67645912bd",
      "status": "READY_TO_SYNC",
      "reason": "Completed credit eligible for income auto-recording",
      "createdAtMs": 1793889504022,
      "retryCount": 0,
      "notified": False,
      "parsed": {
        "amountPaise": 4000,
        "merchant": None,
        "reference": None,
        "transactionDate": "2026-11-05",
        "transactionDateTime": None,
        "status": "CREDIT",
        "categorySuggestion": "Other Income",
        "note": "ref: XXX924375; sms-status: credit",
        "sender": "AX-SDCCBL-S",
        "timestampMs": 1793889504022,
        "evidence": "amount=₹40.00; ref=XXX924375; date=2026-11-05; sender=AX-SDCCBL-S",
        "availableBalancePaise": 613709,
        "accountSuffix": "4375",
        "bankName": "Salem District Central Co-operative Bank",
        "classification": "BANK_CREDIT",
        "confidence": "HIGH"
      }
    },
    {
      "id": "0a5ab8c8260324ebdd499b04bca6472cc86dc236884d52a2a81d243f174fdc24",
      "status": "SYNCED",
      "reason": "Completed credit eligible for income auto-recording",
      "createdAtMs": 1793998487557,
      "syncedAtMs": 1794074754748,
      "retryCount": 0,
      "notified": False,
      "parsed": {
        "amountPaise": 300300,
        "merchant": None,
        "reference": None,
        "transactionDate": "2026-11-07",
        "transactionDateTime": None,
        "status": "CREDIT",
        "categorySuggestion": "Other Income",
        "note": "ref: XXX924375; sms-status: credit",
        "sender": "AD-SDCCBL-S",
        "timestampMs": 1793998487557,
        "evidence": "amount=₹3,003.00; ref=XXX924375; date=2026-11-07; sender=AD-SDCCBL-S",
        "availableBalancePaise": 1214309,
        "accountSuffix": "4375",
        "bankName": "Salem District Central Co-operative Bank",
        "classification": "BANK_CREDIT",
        "confidence": "HIGH"
      }
    }
  ]
}

with open("scripts/ready_queue.json", "w", encoding="utf-8") as f:
    json.dump(data, f)
print("Written scripts/ready_queue.json")
