#!/bin/bash
cd /d/Open-Kiosk-App
firebase deploy --only functions 2>&1
echo "Deploy exit code: $?"
