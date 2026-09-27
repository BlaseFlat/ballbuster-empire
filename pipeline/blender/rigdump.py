# dump rest skeleton data for both rigs to json (armature space)
import bpy, json, sys
argv = sys.argv[sys.argv.index("--")+1:]
a=[o for o in bpy.data.objects if o.type=='ARMATURE'][0]
out={}
for b in a.data.bones:
    q=b.matrix_local.to_3x3().to_quaternion()
    out[b.name]={"head":list(b.head_local),"tail":list(b.tail_local),"parent":b.parent.name if b.parent else None,"rest_q":[q.w,q.x,q.y,q.z]}
json.dump(out,open(argv[0],"w"),indent=0)
