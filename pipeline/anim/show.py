import json, sys
r = json.load(open(sys.argv[1]))
for x in r:
    g = x.get("grp", {})
    gs = " ".join(f"{k}:{v[0]}@{v[3]}" for k, v in g.items())
    print(f"{x['tag']:9s} pen {x['pen']:.3f} n{x['cnt']:<4d} gap {x['gap']:.3f} {str(x['gap_part']):6s} [{gs}] ins {x['instep']} toe {x['toe']} shoeY {x['shoe_back_y']} kz {x['knee_z']} ki {x['knee_inner']} th {x['thigh_elev']} sh {x['shin_elev']} hf {x['hip_flex']} fp {x['foot_point']} lean {x['lean']} heel {x['heel_l']} pd {x['pel_dist']}")
