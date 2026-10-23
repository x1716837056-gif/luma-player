const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ageGroup,certificationAge,extractCertification,matchesCatalog,matchesYear}=require('../shared/catalog.mjs');
test('age groups use explicit regional certificates and retain unknown ratings',()=>{
  assert.equal(certificationAge('USA:PG-13'),13);
  assert.equal(certificationAge('IIB','HK'),15);
  assert.equal(certificationAge('保護級','TW'),6);
  assert.equal(ageGroup({certification:'G'}),'all-ages');
  assert.equal(ageGroup({certification:'TV-MA'}),'18');
  assert.equal(ageGroup({certification:'R'}),'18');
  assert.equal(ageGroup({certification:'IIB',certificationRegion:'HK'}),'16');
  assert.equal(ageGroup({certification:'NR'}),'unknown');
  assert.equal(ageGroup({certification:'Unknown'}),'unknown');
});
test('regional certificates prefer language region and theatrical releases without inventing ages',()=>{
  const result=extractCertification({release_dates:{results:[{iso_3166_1:'US',release_dates:[{type:3,certification:'PG-13'}]},{iso_3166_1:'HK',release_dates:[{type:3,certification:'IIB'}]}]}},'movie','zh-CN');
  assert.deepEqual(result,{certification:'IIB',certificationRegion:'HK',minimumAge:15});
  assert.deepEqual(extractCertification({content_ratings:{results:[{iso_3166_1:'US',rating:'TV-MA'}]}},'tv'),{certification:'TV-MA',certificationRegion:'US',minimumAge:18});
  assert.deepEqual(extractCertification({release_dates:{results:[]}},'movie'),{});
});
test('genre, recommended age and release year combine; unknown and historical years remain discoverable',()=>{
  const dune={genre:['Science Fiction','Adventure'],year:2024,certification:'PG-13'};
  assert.equal(matchesCatalog(dune,{genre:'scifi',age:'13',year:'decade:2020'}),true);
  assert.equal(matchesCatalog(dune,{genre:'comedy',age:'13',year:'2024'}),false);
  assert.equal(matchesCatalog(dune,{genre:'scifi',age:'18',year:'2024'}),false);
  assert.equal(matchesYear(dune,'recent',2026),true);
  assert.equal(matchesYear({year:1979},'before-1980'),true);
  assert.equal(matchesYear({year:0},'before-1980'),false);
  assert.equal(matchesCatalog({genre:[],year:0},{genre:'unknown',age:'unknown',year:'unknown'}),true);
});
