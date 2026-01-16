unset DISPLAY
read RX TX < <(/usr/bin/node /opt/scripts/AGW_TIM_HUB_arm.js | jq -r '[.broadband.dsl.data_transferred.download_mb, .broadband.dsl.data_transferred.upload_mb] | join(" ")')
# restituisce i parametri al chiamante (*1000000 in quanto i valori del modem sono in MBytes)
echo "$(echo "$RX * 1000000" | bc) $(echo "$TX * 1000000" | bc)"
