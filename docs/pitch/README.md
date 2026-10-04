# PewnySzlak — pitch hackathonowy

Gotowa prezentacja po polsku, 10 slajdów, proporcje 16:9. Limit 10 slajdów wynika z wymagań wyzwania „Kraków bez barier” w `krakow.pdf`.

- `output/PewnySzlak-Pitch-PL.pdf` — wersja do zgłoszenia i wyświetlania.
- `output/PewnySzlak-Pitch-PL.pptx` — wersja edytowalna, z notatkami dla prezentera i natywnym wykresem.
- `assets/` — aktualne zrzuty działającej aplikacji.

## Narracja

1. Kraków w Twoim tempie
2. Problem: cel jest blisko, dojście kończy się schodami
3. Rozwiązanie: trasa dopasowana do limitów
4. Demo: Rynek Główny – Wawel, mapa i widok tekstowy
5. Scenariusze użycia: wózek, bagaż, rower i przerwa po drodze
6. SAR-1: demonstracja radarowych sygnałów zmian
7. LiDAR: mock profilu terenu i nachylenia
8. Technologia, źródła i wiarygodność
9. Propozycja modelu biznesowego i dalszego rozwoju
10. Podsumowanie i przejście do dema

## Sposób prezentacji

Około 4 minut na deck, a następnie 60–90 sekund pokazu aplikacji. Notatki w PowerPoincie zawierają przykładową wypowiedź do każdego slajdu oraz źródła twierdzeń.

Scenariusz konkursowy skupia się na osobie na wózku. Pozostałe use case’y pokazują zastosowania i kierunki rozwoju. Model płatnego API i widgetu dla partnerów jest hipotezą biznesową.

SAR-1 pozostaje nazwą roboczą warstwy radarowej podaną przez zespół. Nie potwierdzono dostawcy ani misji, a repozytorium nie zawiera tej integracji. W prezentacji sygnały są oznaczone jako symulacja. Nie utożsamiamy SAR-1 z Sentinel-1.

Wykres LiDAR pokazuje dane syntetyczne: wznios 3 m na 30 m daje 10%, a 1,2 m na 30 m daje 4%. Prototyp zawiera klienta NMT GUGiK. Surowa chmura LiDAR i jej wpływ na routing pozostają mockiem. NMT opisuje powierzchnię gruntu i nie potwierdza dostępności chodnika.

Prezentacja zachowuje różnicę między rzeczywistym grafem OSM, barierą demonstracyjną i pomiarem w terenie. Nie obiecuje pewnej dostępności ani nie podaje zmyślonych wyników pilotażu.
