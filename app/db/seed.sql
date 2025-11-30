-- Suppliers
INSERT INTO suppliers (name, type, country, mill_location, lat, lng, woolmark_certified, rws_certified, sustainability_data) VALUES 
('Holland & Sherry', 'Mill', 'UK', 'Peebles, Scotland', 55.6515, -3.1936, 1, 1, '{"p1_rws": "yes", "p1_chemistry": "partial", "p2_tier3": "yes", "p2_batch": "yes", "p3_audit": "valid", "p3_risk": "low", "p4_fibre_impact": "A"}'),
('Standeven', 'Mill', 'UK', 'Bradford, England', 53.7959, -1.7594, 1, 1, '{"p1_rws": "yes", "p1_woolmark": "yes", "p1_chemistry": "partial", "p2_tier3": "yes", "p3_risk": "low", "p4_fibre_impact": "A"}'),
('Reda', 'Mill', 'Italy', 'Valle Mosso, Italy', 45.6333, 8.1333, 1, 1, '{"p1_rws": "yes", "p1_chemistry": "yes", "p2_tier3": "yes", "p3_risk": "low", "p4_fibre_impact": "A"}'),
('Loro Piana', 'Mill', 'Italy', 'Quarona, Italy', 45.7667, 8.2667, 1, 1, '{"p1_rws": "yes", "p1_woolmark": "yes", "p1_chemistry": "yes", "p2_tier3": "yes", "p3_risk": "low", "p4_fibre_impact": "A"}'),
('Drapers', 'Mill', 'Italy', 'Bologna, Italy', 44.4949, 11.3426, 0, 0, '{"p3_risk": "low", "p4_fibre_impact": "C"}'),
('Carnet', 'Mill', 'Italy', 'Biella, Italy', 45.5629, 8.0583, 0, 0, '{"p1_chemistry": "yes", "p3_risk": "low", "p4_fibre_impact": "C"}'),
('Ermenegildo Zegna', 'Mill', 'Italy', 'Trivero, Italy', 45.6667, 8.1667, 1, 1, '{"p1_rws": "yes", "p1_chemistry": "yes", "p2_tier3": "yes", "p3_risk": "low", "p4_fibre_impact": "A"}'),
('Kadwood Atelier Sydney', 'Atelier', 'Australia', 'Sydney, Australia', -33.8688, 151.2093, 0, 0, '{}'),
('Kadwood Atelier Prague', 'Atelier', 'Czech Republic', 'Prostejov, Czechia', 49.4719, 17.1128, 0, 0, '{}');

-- Fabric Collections
-- Holland & Sherry (ID 1)
INSERT INTO fabric_collections (supplier_id, bunch_name) VALUES 
(1, 'Crystal Springs'), (1, 'Impact Mesh'), (1, 'Cashique Jackets'), (1, 'Classic Overcoats and Topcoats'),
(1, 'Sherry Stretch'), (1, 'Supernova'), (1, 'Oceania'), (1, 'Cotton Classics'), (1, 'Linen Collection'), 
(1, 'Capehorn'), (1, 'Cashique'), (1, 'Classic Mohairs'), (1, 'Airesco'), (1, 'Dragonfly'), 
(1, 'Masterpiece Gold'), (1, 'Intercity'), (1, 'Target Elite'), 
(1, 'Perennial Classics'), (1, 'Chequers'), (1, 'Classic Worsted Flannel'), (1, 'Gostwyck'), (1, 'Moorland Tweed'), 
(1, 'Harris Tweed'), (1, 'SherryKash'), (1, 'Cashmere Doeskin'), (1, 'Black Tie'), (1, 'Masquerade');

-- Standeven (ID 2)
INSERT INTO fabric_collections (supplier_id, bunch_name) VALUES 
(2, 'Black Storm'), (2, 'British Classic'), (2, 'British Mohair'), (2, 'Capetown'), (2, 'Carnival'), 
(2, 'Churchill'), (2, 'Escudo'), (2, 'Everest'), (2, 'Explorer'), (2, 'Festival'), 
(2, 'Glenesk'), (2, 'Heritage Twist'), (2, 'Montrose Bay'), (2, 'Oxbridge'), (2, 'Park Lane'), 
(2, 'Platinum'), (2, 'Savile Row'), (2, 'Signature'), (2, 'Snowdonia'), (2, 'Stonedale Flannel'), 
(2, 'Summerstrand'), (2, 'Toledo');

-- Reda (ID 3)
INSERT INTO fabric_collections (supplier_id, bunch_name) VALUES 
(3, '110''s Suits'), (3, '130''s Suits'), (3, 'Hopsack & Knit Effect'), (3, '150''s Suits'), (3, 'Cashmere & Flannel'), 
(3, 'Milano Jacket'), (3, 'Wool Silk Linen Jacket'), (3, 'Merino Shirt & Jersey');

-- Loro Piana (ID 4)
INSERT INTO fabric_collections (supplier_id, bunch_name) VALUES 
(4, 'Australis'), (4, 'Cashmere'), (4, 'Tasmanian'), (4, 'Volare'), (4, 'LP System'), 
(4, 'Cashmere Award'), (4, 'Mooving Travel Line'), (4, 'Summertime Move'), (4, 'Twister'), 
(4, 'Cashmere Award Move'), (4, 'Mooving'), (4, 'Zelander'), (4, 'Zelander Dream'), 
(4, 'Four Seasons'), (4, 'Sunset'), (4, 'Cashmere Cloud'), (4, 'Capolavoro'), (4, 'Doeskin'), (4, 'Cashmere Wish');

-- Drapers (ID 5)
INSERT INTO fabric_collections (supplier_id, bunch_name) VALUES 
(5, 'Light Panama'), (5, 'Ascot'), (5, 'Box Six Ply'), (5, 'Supersonic'), (5, 'The Bingley'), 
(5, 'Portofino Linen'), (5, 'Cotton Club'), (5, 'Cotton Deluxe'), (5, 'Montecarlo'), 
(5, 'Greenhills Super 180''s'), (5, 'Greenhills Kandura'), (5, 'Hope Collection'), (5, 'Arrival'), (5, 'Winter Arrival');

-- Carnet (ID 6)
INSERT INTO fabric_collections (supplier_id, bunch_name) VALUES 
(6, 'Capri'), (6, 'Corduroy'), (6, 'Cashmere Cotton'), (6, 'Brunello Linings'), (6, 'Bemberg'), 
(6, 'Comfort Cashmere'), (6, 'Comfort Flannel'), (6, 'Narciso'), (6, 'Premium Classics'), 
(6, 'Sapeurs 2.0'), (6, 'Superior Classics'), (6, 'Harris Tweed'), (6, 'Seersucker'), (6, 'Velvis'),
(6, 'FERLA summer'), (6, 'Donna Collection'), (6, 'Sunlit wools'), (6, 'Esential Classics'), 
(6, 'Seersucker & Linen'), (6, 'COATS+'), (6, 'Ferla Winter');

-- Zegna (ID 7)
INSERT INTO fabric_collections (supplier_id, bunch_name) VALUES 
(7, 'Heritage'), (7, 'Tropical'), (7, 'Cross-Ply'), (7, 'Island Fleece'), (7, 'Summer Vibes'), 
(7, 'Premium Cashmere'), (7, 'Amezing'), (7, 'Cool Effect'), (7, 'Winter Cottons'), 
(7, 'Summer Plains'), (7, 'Panoramica'), (7, 'Trofeo'), (7, 'Traveller'), (7, '15 Milmil 15'), 
(7, 'High Performance'), (7, 'Anteprima'), (7, 'Cashco'), (7, 'Deep Black');
