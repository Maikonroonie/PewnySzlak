# PRODUCT REQUIREMENTS DOCUMENT (PRD)
## Nazwa kodowa projektu: PewnySzlak 
**Wyzwanie:** HackYeah 2026 - "Kraków bez barier"

### 1. Cel Projektu
Stworzenie interaktywnego narzędzia nawigacyjno-turystycznego, które pozwala użytkownikom (mieszkańcom i turystom) oceniać i wyznaczać trasy w oparciu o zdefiniowane preferencje dotyczące fizycznych barier architektonicznych (takich jak progi, schody, nawierzchnia, nachylenie). 
System nie ogranicza się do binarnego oznaczania "dostępne/niedostępne", lecz prezentuje szczegółowe metadane pozwalające użytkownikowi na samodzielną ocenę przydatności trasy.

### 2. Grupy Docelowe i Kontekst Prezentacji
*   **Docelowy rynek (Wdrożenie):** Wszyscy turyści i mieszkańcy potrzebujący specyficznej nawierzchni – osoby na wózkach inwalidzkich, rodzice z wózkami dziecięcymi, turyści z ciężkim bagażem, rowerzyści oraz użytkownicy hulajnóg i rolek.
*   **Ograniczenie na potrzeby demonstracji (Zgodność z regulaminem):** Zgodnie z wymaganiami wyzwania, prototyp na prezentację jurorską zostanie zaprezentowany z perspektywy **tylko jednego, konkretnego rodzaju potrzeb** – wyznaczania trasy i punktów docelowych dla osoby poruszającej się na wózku (unikanie schodów, krawężników, stromych nachyleń).
*   **Prywatność:** Aplikacja nie wymaga logowania, zakładania konta ani podawania informacji o stanie zdrowia/niepełnosprawności – opiera się wyłącznie na liście preferencji dotyczących barier.

### 3. Główne Funkcjonalności (Zakres MVP)

**A. Dynamiczny Silnik Tras (Routing oparty na preferencjach)**
*   Aplikacja musi wyznaczać trasę między dwoma punktami, dynamicznie modyfikując przebieg drogi na podstawie wybranego przez użytkownika profilu przemieszczania się.
*   Silnik musi aktywnie omijać przeszkody zdefiniowane jako niedostępne dla danego profilu (np. schody).

**B. Asystent AI i Analiza Danych Publicznych (Protokół MCP)**
Aplikacja posiada zintegrowanego asystenta AI, który korzysta z zewnętrznych, ustrukturyzowanych danych publicznych za pomocą protokołu MCP (Model Context Protocol) bez konieczności scrapowania:
*   **Detekcja utrudnień drogowych:** Silnik w tle odpytuje serwer MCP dla Gmin (`z-dykty.pl/api/mcp`) o najnowsze informacje o wydatkach i przetargach w Krakowie. Na tej podstawie wykrywa lokalizacje aktualnych robót drogowych/remontów nawierzchni i nanosi je na mapę jako tymczasowe bariery, które silnik tras musi ominąć.
*   **Rekomendacje zdrowotno-turystyczne:** Użytkownik może zapytać asystenta o placówki medyczne. Asystent łączy się z serwerem MCP Ochrony Zdrowia (`psoz.pl/mcp`), znajduje najbliższą publiczną placówkę NFZ (np. dostosowaną przychodnię) i nakazuje systemowi wyznaczenie do niej bezpiecznej trasy.

**C. Moduł Transparentności i Wiarygodności Danych**
Zgodnie z rygorystycznymi wymaganiami, aplikacja nie może prezentować informacji jako pewników, jeśli nimi nie są.
*   Przy każdym odcinku trasy lub punkcie na mapie aplikacja musi wyświetlać okienko z informacją o barierach.
*   Każda taka informacja musi posiadać **Źródło** (np. OpenStreetMap, zgłoszenie użytkownika, API Gminy), **Datę aktualizacji** oraz wyraźny **Status Wiarygodności**.
*   Wizualne oznaczenia: Trasy, dla których brakuje danych o nawierzchni lub dane pochodzą z niepotwierdzonych zgłoszeń społecznościowych, muszą być na mapie wyraźnie odróżnione (np. przerywaną linią, kolorem) i ostrzegać użytkownika. Aplikacja nie może zakładać, że brak informacji oznacza brak barier.

**D. Crowdsourcing (Walidacja Społecznościowa)**
*   Moduł interfejsu pozwalający użytkownikowi aplikacji zgłosić nową barierę (np. "zepsuta winda", "koniec remontu") lub potwierdzić/odrzucić informację o barierze widoczną na mapie. 
*   System przewiduje mechanizm poprawiania błędnych i nieaktualnych danych przez społeczność.

### 4. Wymagania Architektoniczne i Techniczne
*   **Separacja warstw:** Architektura musi w sposób fizyczny i logiczny oddzielać mechanizm pobierania, aktualizowania i przeliczania danych (backend/silnik AI) od sposobu ich prezentacji (interfejs użytkownika/frontend).
*   **Niezależność od systemów miejskich:** Rozwiązanie musi funkcjonować całkowicie na własnej infrastrukturze i nie może wymagać, ani zakładać dostępu do jakichkolwiek wewnętrznych systemów Urzędu Miasta Krakowa lub miejskich jednostek organizacyjnych.
*   **Użycie Otwartych Danych:** Główna siatka drogowa ma bazować na publicznie dostępnych danych (np. OpenStreetMap, usługi z otwartedane.um.krakow.pl) z przestrzeganiem ich licencji.

### 5. Wymagania Niefunkcjonalne (Dostępność Cyfrowa)
Projekt musi docelowo realizować standardy WCAG 2.2 na poziomie AA. Już w fazie prototypu należy bezwzględnie wdrożyć:
*   **Pełna nawigacja klawiaturą:** Możliwość przejścia przez główny scenariusz (od wyboru preferencji po wyznaczenie i odczytanie trasy) wyłącznie przy pomocy klawiatury.
*   **Zgodność z czytnikami ekranu (Screen Readers):** Odpowiednie etykiety semantyczne dla wszystkich elementów sterujących.
*   **Tekstowa alternatywa dla mapy:** Aplikacja musi posiadać specjalny widok (np. panel boczny lub oddzielną zakładkę), w którym cała wyznaczona trasa graficzna oraz wszystkie bariery po drodze są opisane w formie uporządkowanej, czytelnej listy tekstowej. Odpowiedni kontrast wizualny elementów interfejsu.

### 6. Kryteria Akceptacji Prototypu (Demo Flow)
Model generujący kod musi zapewnić, że aplikacja będzie w stanie zaprezentować następujący scenariusz na żywo:
1.  Użytkownik wchodzi do aplikacji i wybiera preferencje unikania barier dedykowane wózkom inwalidzkim (brak logowania).
2.  Wyznaczana jest trasa z punktu A do punktu B.
3.  Aplikacja automatycznie omija odcinek drogi (lub oznacza go jako niebezpieczny), na którym asystent AI (poprzez MCP `z-dykty.pl/api/mcp`) wykrył prowadzony remont nawierzchni finansowany przez gminę.
4.  Po kliknięciu w wybrany odcinek trasy, aplikacja prezentuje wskaźnik wiarygodności, wskazując źródło danych, brakujące informacje oraz datę ich pozyskania.
5.  Użytkownik przełącza widok na "Alternatywę Tekstową", która czytelnie wylistowuje kroki trasy i przeszkody.
6.  Cały proces daje się przeklikać bez użycia myszki (tylko klawiatura).
