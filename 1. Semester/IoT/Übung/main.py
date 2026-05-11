"""
MicroPython IoT Weather Station Example for Wokwi.com

To view the data:

1. Go to http://www.hivemq.com/demos/websocket-client/
2. Click "Connect"
3. Under Subscriptions, click "Add New Topic Subscription"
4. In the Topic field, type "wokwi-weather" then click "Subscribe"

Now click on the DHT22 sensor in the simulation,
change the temperature/humidity, and you should see
the message appear on the MQTT Broker, in the "Messages" pane.

Copyright (C) 2022, Uri Shaked

https://wokwi.com/arduino/projects/322577683855704658
"""

import network
import time
import ntptime
from machine import Pin, PWM, I2C
import ssd1306
import dht
import ujson
from umqtt.simple import MQTTClient

# MQTT Server Parameters
MQTT_CLIENT_ID = "micropython-weather-demo"
MQTT_BROKER    = "broker.mqttdashboard.com"
MQTT_USER      = ""
MQTT_PASSWORD  = ""
MQTT_TOPIC     = "wokwi-weather"

sensor = dht.DHT22(Pin(15))

# Initialize I2C (SCL=22, SDA=21)
i2c = I2C(0, scl=Pin(22), sda=Pin(21))

# Initialize OLED
oled = ssd1306.SSD1306_I2C(128, 64, i2c)

# LED Bargraph Setup
bar_pins = [2, 4, 5, 12, 13, 14, 18, 19, 26, 27]
leds = [Pin(pin, Pin.OUT) for pin in bar_pins]

# Aufgabe 5: Temperaturbereich auf LEDs umrechnen
def map_temperature_to_leds(temp):
    min_temp = -20.0
    max_temp = 60.0
    
    if temp <= min_temp: return 0
    if temp >= max_temp: return 10
        
    active = int((temp - min_temp) / (max_temp - min_temp) * 10)
    return active

print("Connecting to WiFi", end="")
sta_if = network.WLAN(network.STA_IF)
sta_if.active(True)
sta_if.connect('Wokwi-GUEST', '')
while not sta_if.isconnected():
  print(".", end="")
  time.sleep(0.1)
print(" Connected!")

print("Connecting to MQTT server... ", end="")
client = MQTTClient(MQTT_CLIENT_ID, MQTT_BROKER, user=MQTT_USER, password=MQTT_PASSWORD)
client.connect()

print("Connected!")

# Aufgabe 3: Zeit per NTP holen
print("Fetching current time via NTP... ", end="")
try:
    ntptime.settime()
    print("Time updated!")
except Exception as e:
    print("NTP Fehler:", e)

prev_weather = ""
while True:
  print("Measuring weather conditions... ", end="")
  sensor.measure()

  temp = sensor.temperature()
  hum = sensor.humidity()

  t = time.localtime()
  time_str = "{:04d}-{:02d}-{:02d} {:02d}:{:02d}:{:02d}".format(t[0], t[1], t[2], t[3], t[4], t[5])

  message = ujson.dumps({
    "time": time_str,
    "temp": temp,
    "humidity": hum,
  })

  # Aufgabe 4: OLED Display aktualisieren
  oled.fill(0) # Display leeren
  oled.text("Temp: {:.1f} C".format(temp), 0, 0)
  oled.text("Hum:  {:.1f} %".format(hum), 0, 16)
  oled.text(time_str[11:], 0, 48) # Uhrzeit anzeigen (optional)
  oled.show() 

  # Aufgabe 5: Bargraph aktualisieren
  active_leds = map_temperature_to_leds(temp)
  for i in range(10):
      if i < active_leds:
          leds[i].value(1)
      else:
          leds[i].value(0)

  if message != prev_weather:
    print("Updated!")
    print("Reporting to MQTT topic {}: {}".format(MQTT_TOPIC, message))
    client.publish(MQTT_TOPIC, message)
    prev_weather = message
  else:
    print("No change")
  time.sleep(1)
