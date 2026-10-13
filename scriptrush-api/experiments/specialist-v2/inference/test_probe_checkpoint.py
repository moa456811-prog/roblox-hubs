"""Recovery probe tests use no credential, requests, SDK or network."""
import ast
import json
from pathlib import Path
import struct
import tempfile
import unittest

import probe_checkpoint as probe


class Response:
    def __init__(self,raw=b"",status=200,headers=None,url="https://api.kaggle.com/v1/fixed"):
        self.raw,self.status_code,self.headers,self.url = raw,status,headers or {},url
        self.closed = False
    def close(self):
        self.closed = True
    def iter_content(self,chunk_size):
        yield self.raw


def weight_bytes():
    header=json.dumps({"base_model.model.x.lora_A.weight":{"dtype":"F32","shape":[1],"data_offsets":[0,4]}}).encode()
    return struct.pack("<Q",len(header))+header+b"\0\0\0\0"


def files():
    return {"trainer_state.json":json.dumps({"global_step":32,"best_global_step":32,"best_metric":0.03299146145582199,"best_model_checkpoint":"/kaggle/working/scriptrush-specialist-v2/training/checkpoint-32","log_history":[{"step":32,"eval_loss":0.03299146145582199}]}).encode(),
            "adapter_config.json":json.dumps({"base_model_name_or_path":probe.MODEL,"peft_type":"LORA","revision":probe.REVISION}).encode(),
            "adapter_model.safetensors":weight_bytes(),"README.md":b"owned mock checkpoint"}


class ProbeTests(unittest.TestCase):
    def test_fixed_own_source_receipt_is_checked_without_network(self):
        self.assertEqual(probe.validate_local_source()["sourceScriptSha256"],probe.SOURCE_SCRIPT_SHA256)
        self.assertEqual(probe.SOURCE_NOTEBOOK,"sciptrush/scriptrush-v2-production-8af8851d")
        self.assertEqual(probe.SOURCE_VERSION,1)
        self.assertEqual(probe.MAX_TOTAL_BYTES,200*1024*1024)

    def test_unavailable_first_file_stops_without_consuming_other_downloads(self):
        calls=[]
        def fetch(name):
            calls.append(name)
            raise probe.ProbeError("CHECKPOINT_UNAVAILABLE",404)
        with tempfile.TemporaryDirectory() as temporary:
            receipt,target=probe.probe(fetch,{"sourceScriptSha256":"a"*64},Path(temporary)/"probe")
            self.assertEqual(calls,["trainer_state.json"])
            self.assertFalse(receipt["complete"])
            self.assertEqual(receipt["status"],404)
            self.assertFalse(receipt["cancelRequested"])
            self.assertEqual(receipt["files"],{})
            self.assertTrue((target/"recovery-receipt.json").is_file())

    def test_recovery_receipt_preserves_exact_bytes_and_raw_provenance(self):
        content=files()
        with tempfile.TemporaryDirectory() as temporary:
            receipt,target=probe.probe(lambda name:Response(content[name]),{"sourceScriptSha256":"a"*64},Path(temporary)/"probe")
            self.assertTrue(receipt["complete"])
            self.assertEqual(receipt["artifactKind"],"recovered-checkpoint")
            self.assertFalse(receipt["trainingSummaryFabricated"])
            self.assertEqual(receipt["globalStep"],32)
            for name,raw in content.items():
                self.assertEqual((target/name).read_bytes(),raw)
                self.assertEqual(receipt["files"][name]["sha256"],probe.sha(raw))
            self.assertFalse((target/"training-summary.json").exists())
            with self.assertRaises(FileExistsError):
                probe.probe(lambda name:Response(content[name]),{},target)

    def test_redirect_targets_are_validated_and_never_expose_signed_urls(self):
        for url in ["http://storage.googleapis.com/x", "https://evil.example/x", "https://user:pass@storage.googleapis.com/x", "https://storage.googleapis.com:444/x", "https://storage.googleapis.com.evil.example/x"]:
            self.assertFalse(probe.safe_download_url(url))
        calls=[]
        raw=Response(b"owned bytes")
        redirected=Response(status=302,headers={"Location":"https://storage.googleapis.com/owned/signed?SECRET_DO_NOT_LOG"})
        result=probe.resolve_file_response(redirected,lambda url:calls.append(url) or raw)
        self.assertIs(result,raw)
        self.assertTrue(redirected.closed)
        self.assertEqual(len(calls),1)
        with self.assertRaises(probe.ProbeError) as caught:
            probe.resolve_file_response(Response(status=302,headers={"Location":"https://evil.example/SECRET_DO_NOT_LOG"}),lambda url:self.fail("Unsafe redirected fetch"))
        self.assertNotIn("SECRET_DO_NOT_LOG",str(caught.exception))

    def test_bounded_partial_and_html_files_never_become_recovered_weights(self):
        with tempfile.TemporaryDirectory() as temporary:
            target=Path(temporary)/"adapter_model.safetensors"
            for response,limit in [(Response(b"12345"),4),(Response(b"1234",headers={"Content-Length":"9"}),8),(Response(b"",headers={}),8)]:
                with self.assertRaises(probe.ProbeError):
                    probe.save_bounded(response,target,limit)
                self.assertFalse(target.exists())
                self.assertFalse(target.with_suffix(".safetensors.part").exists())
            with self.assertRaises(probe.ProbeError):
                probe.resolve_file_response(Response(b"<html>secret</html>",headers={"Content-Type":"text/html"}),lambda url:self.fail())

    def test_wrong_step_or_truncated_tensor_file_cannot_claim_success(self):
        for filename,changed in [("trainer_state.json",json.dumps({"global_step":16,"best_metric":0.1}).encode()),("adapter_model.safetensors",weight_bytes()[:-1])]:
            content=files();content[filename]=changed
            with tempfile.TemporaryDirectory() as temporary:
                receipt,_=probe.probe(lambda name:Response(content[name]),{},Path(temporary)/"probe")
                self.assertFalse(receipt["complete"])

    def test_source_has_no_cancel_submission_env_credential_or_redirect_auth_flow(self):
        text=Path(probe.__file__).read_text(encoding="utf-8")
        tree=ast.parse(text)
        calls=[node.func.attr if isinstance(node.func,ast.Attribute) else node.func.id if isinstance(node.func,ast.Name) else "" for node in ast.walk(tree) if isinstance(node,ast.Call)]
        self.assertFalse({"cancel_kernel_session","save_kernel","kernels_push","authenticate","Trainer","train"}&set(calls))
        self.assertNotIn("os.environ",text)
        self.assertIn('api_token=credential, verbose=False',text)
        self.assertIn('allow_redirects=False',text)
        self.assertIn('anonymous = requests.Session()',text)


if __name__ == "__main__":
    unittest.main()
